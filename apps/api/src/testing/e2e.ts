import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { createServer, IncomingMessage, Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { SMTPServer } from 'smtp-server';
import { ParsedMail, simpleParser } from 'mailparser';

export const BOOTSTRAP_TOKEN = 'bootstrap-token-'.padEnd(40, 'x');
export const INBOUND_TOKEN = 'inbound-token-'.padEnd(40, 'i');
export const INTERNAL_TOKEN = 'w'.repeat(40);

export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL) to a disposable PostgreSQL database: the e2e tests truncate every table.');
  return url;
}

export type FakeSmtp = { port: number; mails: ParsedMail[]; failNext: number; close: () => Promise<void> };
export type FakeBridge = { url: string; sent: { to: string; text: string; sessionId: string }[]; close: () => Promise<void> };

/** Accepts mail on a random local port and keeps it parsed. */
export async function startFakeSmtp(): Promise<FakeSmtp> {
  const state: FakeSmtp = { port: 0, mails: [], failNext: 0, close: async () => undefined };
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS', 'AUTH'],
    onData(stream, _session, callback) {
      simpleParser(stream).then((mail) => {
        if (state.failNext > 0) {
          state.failNext -= 1;
          return callback(Object.assign(new Error('mailbox unavailable'), { responseCode: 451 }));
        }
        state.mails.push(mail);
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.port = (server.server.address() as { port: number }).port;
  state.close = () => new Promise((resolve) => server.close(() => resolve()));
  return state;
}

/** Stands in for the Go WhatsApp bridge. */
export async function startFakeBridge(): Promise<FakeBridge> {
  const sent: FakeBridge['sent'] = [];
  const read = (req: IncomingMessage) => new Promise<string>((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
  const server: Server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/v1/messages/text') {
      const body = JSON.parse(await read(req));
      sent.push({ to: body.to, text: body.text, sessionId: body.sessionId });
      return res.end(JSON.stringify({ id: `wamid-${sent.length}` }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, sent, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

export async function resetDatabase(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const names = tables.map((row) => `"${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

export type E2eEnv = Record<string, string>;

export async function bootApp(extra: E2eEnv = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    SECRET_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    BOOTSTRAP_TOKEN,
    BOOTSTRAP_ENABLED: 'true',
    EMAIL_INBOUND_TOKEN: INBOUND_TOKEN,
    WHATSAPP_INTERNAL_TOKEN: INTERNAL_TOKEN,
    RUN_QUEUE_WORKERS: 'false',
    RUN_SEQUENCE_SCHEDULER: 'false', // tests drive the scheduler by hand
    WEB_ORIGIN: 'http://localhost:3000',
    API_PUBLIC_URL: 'http://127.0.0.1:4000',
    ALLOW_PRIVATE_SMTP: 'true',
    AUTH_EDGE_RATE_LIMIT_MAX: '100000',
    EDGE_RATE_LIMIT_MAX: '100000',
    RATE_LIMIT_MAX: '100000',
    LOGIN_RATE_LIMIT_MAX: '100000',
    ...extra,
  });
  // Imported late so the environment above is what the modules read.
  const { AppModule } = await import('../app.module');
  const { configureApp } = await import('../app.setup');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`.replace('[::1]', '127.0.0.1');
  return { app, base };
}

export class Api {
  token = '';
  constructor(readonly base: string) {}

  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(this.base + path, {
      method,
      headers: {
        origin: 'http://localhost:3000',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json: any = text;
    try { json = JSON.parse(text); } catch { /* plain text */ }
    return { status: response.status, json };
  }

  async login(tenantSlug: string, email: string, password: string) {
    const out = await this.call('POST', '/auth/login', { tenantSlug, email, password });
    if (out.status !== 201) throw new Error(`login failed: ${out.status} ${JSON.stringify(out.json)}`);
    this.token = out.json.accessToken;
    return out.json;
  }
}
