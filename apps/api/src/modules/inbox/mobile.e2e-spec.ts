import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import {
  Api, BOOTSTRAP_TOKEN, FakeBridge, FakeExpoPush, FakeSmtp, INBOUND_TOKEN, INTERNAL_TOKEN,
  bootApp, resetDatabase, startFakeBridge, startFakeExpoPush, startFakeSmtp, testDatabaseUrl,
} from '../../testing/e2e';

const MOBILE = { 'x-klyvero-client': 'mobile' };
const EXPO_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const EXPO_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

describe('mobile support (e2e)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
  let app: NestExpressApplication;
  let api: Api;
  let smtp: FakeSmtp;
  let bridge: FakeBridge;
  let expo: FakeExpoPush;
  let tenantId = '';
  const password = 'OwnerPassw0rd!!';

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (check: () => boolean | Promise<boolean>, ms = 4000) => {
    for (let waited = 0; waited < ms; waited += 50) {
      if (await check()) return true;
      await sleep(50);
    }
    return false;
  };

  beforeAll(async () => {
    await resetDatabase(prisma);
    smtp = await startFakeSmtp();
    bridge = await startFakeBridge();
    expo = await startFakeExpoPush();
    const booted = await bootApp({ WHATSAPP_SERVICE_URL: bridge.url, EXPO_PUSH_URL: expo.url });
    app = booted.app;
    api = new Api(booted.base);
    const created = await api.call('POST', '/auth/bootstrap', { bootstrapToken: BOOTSTRAP_TOKEN, tenantName: 'Acme', tenantSlug: 'acme', name: 'Owner', email: 'owner@acme.test', password });
    tenantId = created.json.tenant.id;
    await api.login('acme', 'owner@acme.test', password);
  });

  afterAll(async () => {
    await app?.close();
    await smtp?.close();
    await bridge?.close();
    await expo?.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    smtp.mails.length = 0;
    bridge.sent.length = 0;
    expo.requests.length = 0;
  });

  describe('authentication without cookies', () => {
    const login = (headers: Record<string, string> = {}) => new Api(api.base).call('POST', '/auth/login', { tenantSlug: 'acme', email: 'owner@acme.test', password }, headers);
    const cookieOf = (headers: Headers) => headers.getSetCookie().map((line) => line.split(';')[0]).join('; ');

    it('hands the refresh token to the app in the body and sets no cookie', async () => {
      const mobile = await login(MOBILE);
      expect(mobile.status).toBe(201);
      expect(mobile.json.refreshToken).toEqual(expect.any(String));
      expect(mobile.json.accessToken).toEqual(expect.any(String));
      expect(mobile.headers.getSetCookie()).toHaveLength(0);

      const web = await login();
      expect(web.json.refreshToken).toBeUndefined();
      expect(cookieOf(web.headers)).toContain('klyvero_refresh=');
    });

    it('rotates the token on refresh and kills the family when an old token is replayed', async () => {
      const first = (await login(MOBILE)).json;
      const second = await api.call('POST', '/auth/refresh', { refreshToken: first.refreshToken }, MOBILE);
      expect(second.status).toBe(201);
      expect(second.json.refreshToken).not.toBe(first.refreshToken);
      expect(second.json.user.email).toBe('owner@acme.test');

      expect((await api.call('POST', '/auth/refresh', { refreshToken: first.refreshToken }, MOBILE)).status).toBe(401); // replay
      expect((await api.call('POST', '/auth/refresh', { refreshToken: second.json.refreshToken }, MOBILE)).status).toBe(401); // family revoked
    });

    it('never reads the cookie in mobile mode, so a browser script cannot extract the token', async () => {
      const web = await login();
      const cookie = cookieOf(web.headers);
      const stolen = await api.call('POST', '/auth/refresh', {}, { ...MOBILE, cookie });
      expect(stolen.status).toBe(401);
      expect(stolen.json.refreshToken).toBeUndefined();
      // The cookie flow keeps working for the web app and does not expose the token.
      const refreshed = await api.call('POST', '/auth/refresh', undefined, { cookie });
      expect(refreshed.status).toBe(201);
      expect(refreshed.json.refreshToken).toBeUndefined();
    });

    it('logs out by revoking the token sent in the body', async () => {
      const session = (await login(MOBILE)).json;
      expect((await api.call('POST', '/auth/logout', { refreshToken: session.refreshToken }, MOBILE)).status).toBe(201);
      expect((await api.call('POST', '/auth/refresh', { refreshToken: session.refreshToken }, MOBILE)).status).toBe(401);
    });
  });

  describe('push devices and notifications', () => {
    it('validates and registers a device, moves it to whoever logged in last, and unregisters only your own', async () => {
      expect((await api.call('POST', '/devices', { token: 'nope', platform: 'ios' })).status).toBe(400);
      expect((await api.call('POST', '/devices', { token: EXPO_A, platform: 'windows' })).status).toBe(400);
      expect((await api.call('POST', '/devices', { token: EXPO_A, platform: 'ios', deviceName: 'iPhone da Marina' })).status).toBe(201);
      expect(await prisma.pushDevice.count({ where: { token: EXPO_A } })).toBe(1);

      const created = await api.call('POST', `/tenants/${tenantId}/users`, { name: 'Vendedor', email: 'sdr@acme.test', password: 'SdrPassword123!', role: 'SDR' });
      expect(created.status).toBe(201);
      const sdr = new Api(api.base);
      await sdr.login('acme', 'sdr@acme.test', 'SdrPassword123!');
      await sdr.call('POST', '/devices', { token: EXPO_A, platform: 'android' });
      const moved = await prisma.pushDevice.findUniqueOrThrow({ where: { token: EXPO_A } });
      expect(moved.userId).toBe(created.json.id);
      expect(await prisma.pushDevice.count()).toBe(1);

      await api.call('POST', '/devices/unregister', { token: EXPO_A }); // not the owner's device any more
      expect(await prisma.pushDevice.count()).toBe(1);
      await sdr.call('POST', '/devices/unregister', { token: EXPO_A });
      expect(await prisma.pushDevice.count()).toBe(0);
    });

    it('refuses API keys, which are not people', async () => {
      const key = await api.call('POST', '/api-keys', { name: 'integração', scopes: ['leads'] });
      const out = await new Api(api.base).call('POST', '/devices', { token: EXPO_B, platform: 'ios' }, { 'x-api-key': key.json.apiKey });
      expect(out.status).toBe(403);
    });

    it('turns an inbound WhatsApp message into a bell notification and a push', async () => {
      await prisma.whatsappConnection.create({ data: { tenantId, sessionId: 'principal', connected: true, loggedIn: true } });
      await api.call('POST', '/devices', { token: EXPO_B, platform: 'android' });

      const event = await api.call('POST', '/internal/whatsapp/events', {
        type: 'message', tenantId, sessionId: 'principal', id: 'wa-in-1', from: '5511912345678@s.whatsapp.net', pushName: 'Marcos', text: 'Oi, tem proposta pra mim?',
      }, { 'x-internal-token': INTERNAL_TOKEN });
      expect(event.status).toBe(201);

      expect(await until(() => expo.requests.length > 0)).toBe(true);
      const sent = expo.requests[0][0];
      expect(sent).toMatchObject({ to: EXPO_B, title: 'Nova mensagem de Marcos', body: 'Oi, tem proposta pra mim?', data: { type: 'message', channel: 'WHATSAPP' } });
      const thread = await prisma.messageThread.findFirstOrThrow({ where: { tenantId, channel: 'WHATSAPP' } });
      expect(sent.data.threadId).toBe(thread.id);

      const bell = await api.call('GET', '/notifications');
      expect(bell.json.some((item: any) => item.title === 'Nova mensagem de Marcos')).toBe(true);
    });

    it('does the same for inbound e-mail and forgets tokens Expo says are dead', async () => {
      expo.tickets = (messages) => messages.map(() => ({ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }));
      const reply = await api.call('POST', '/email/inbound', { tenantId, from: 'cliente@empresa.test', to: 'vendas@acme.test', subject: 'Orçamento', text: 'Preciso de um orçamento' }, { 'x-inbound-token': INBOUND_TOKEN });
      expect(reply.status).toBe(201);
      expect(await until(() => expo.requests.length > 0)).toBe(true);
      expect(expo.requests[0][0]).toMatchObject({ title: 'Nova mensagem de cliente@empresa.test', data: { channel: 'EMAIL' } });
      expect(await until(async () => (await prisma.pushDevice.count()) === 0)).toBe(true);
      expo.tickets = (messages) => messages.map(() => ({ status: 'ok', id: 'ticket' }));
    });
  });

  describe('lightweight inbox', () => {
    let threadId = '';

    beforeAll(async () => {
      const contact = await prisma.contact.create({ data: { tenantId, firstName: 'Paula', email: 'paula@loja.test', phone: '5511977776666' } });
      const thread = await prisma.messageThread.create({ data: { tenantId, contactId: contact.id, channel: 'WHATSAPP', externalKey: '5511977776666', lastMessageAt: new Date() } });
      threadId = thread.id;
      const base = Date.now() - 10 * 60_000;
      for (let index = 0; index < 5; index += 1) {
        await prisma.message.create({
          data: { tenantId, threadId, channel: 'WHATSAPP', direction: index % 2 ? 'OUTBOUND' : 'INBOUND', status: index % 2 ? 'SENT' : 'RECEIVED', text: `mensagem ${index + 1}`, createdAt: new Date(base + index * 60_000) },
        });
      }
    });

    it('lists conversations with the last message and unread count', async () => {
      const out = await api.call('GET', '/inbox/threads?take=50');
      expect(out.status).toBe(200);
      const mine = out.json.items.find((item: any) => item.id === threadId);
      expect(mine).toMatchObject({ channel: 'WHATSAPP', unread: 3, contact: { firstName: 'Paula' }, lastMessage: { text: 'mensagem 5' } });
      expect(out.json.items.every((item: any) => item.messages === undefined)).toBe(true);
      expect((await api.call('GET', '/inbox/threads?channel=EMAIL')).json.items.every((item: any) => item.channel === 'EMAIL')).toBe(true);
      expect((await api.call('GET', '/inbox/threads?take=0')).status).toBe(400);
    });

    it('pages messages newest-first but returns them oldest-first', async () => {
      const latest = await api.call('GET', `/inbox/threads/${threadId}/messages?take=2`);
      expect(latest.json.items.map((item: any) => item.text)).toEqual(['mensagem 4', 'mensagem 5']);
      expect(latest.json.hasMore).toBe(true);
      expect(latest.json.thread.contact.firstName).toBe('Paula');

      const older = await api.call('GET', `/inbox/threads/${threadId}/messages?take=10&before=${encodeURIComponent(latest.json.items[0].createdAt)}`);
      expect(older.json.items.map((item: any) => item.text)).toEqual(['mensagem 1', 'mensagem 2', 'mensagem 3']);
      expect(older.json.hasMore).toBe(false);
    });

    it('marks a conversation as read', async () => {
      expect((await api.call('POST', `/inbox/threads/${threadId}/read`)).json).toEqual({ read: 3 });
      const mine = (await api.call('GET', '/inbox/threads')).json.items.find((item: any) => item.id === threadId);
      expect(mine.unread).toBe(0);
      expect((await api.call('POST', `/inbox/threads/${threadId}/read`)).json).toEqual({ read: 0 });
    });

    it('answers on the conversation channel without the app knowing sessions or mailboxes', async () => {
      const whatsapp = await api.call('POST', `/inbox/threads/${threadId}/reply`, { text: 'Claro, te mando agora!' });
      expect(whatsapp.status).toBe(201);
      expect(bridge.sent).toEqual([expect.objectContaining({ to: '5511977776666', text: 'Claro, te mando agora!', sessionId: 'principal' })]);

      const mailbox = await api.call('POST', '/email/mailboxes', { name: 'Vendas', host: '127.0.0.1', port: smtp.port, secure: false, fromAddress: 'vendas@acme.test' });
      expect(mailbox.status).toBe(201);
      const emailThread = await prisma.messageThread.findFirstOrThrow({ where: { tenantId, channel: 'EMAIL' } });
      const email = await api.call('POST', `/inbox/threads/${emailThread.id}/reply`, { text: 'Segue o orçamento.' });
      expect(email.status).toBe(201);
      expect(smtp.mails).toHaveLength(1);
      expect(smtp.mails[0].subject).toBe('Re: Orçamento');
      expect(JSON.stringify(smtp.mails[0].to)).toContain('cliente@empresa.test');
    });

    it('reports what is missing, and never crosses workspaces', async () => {
      await prisma.whatsappConnection.updateMany({ data: { loggedIn: false } });
      const noSession = await api.call('POST', `/inbox/threads/${threadId}/reply`, { text: 'oi' });
      expect(noSession.status).toBe(400);
      expect(noSession.json.message).toMatch(/WhatsApp/);
      expect((await api.call('POST', `/inbox/threads/${threadId}/reply`, { text: '' })).status).toBe(400);
      expect((await api.call('GET', '/inbox/threads/not-a-uuid/messages')).status).toBe(404);

      const other = await prisma.tenant.create({ data: { name: 'Outra', slug: 'outra', type: 'CUSTOMER' } });
      const foreign = await prisma.messageThread.create({ data: { tenantId: other.id, channel: 'EMAIL', lastMessageAt: new Date() } });
      expect((await api.call('GET', `/inbox/threads/${foreign.id}/messages`)).status).toBe(404);
      expect((await api.call('POST', `/inbox/threads/${foreign.id}/read`)).status).toBe(404);
      expect((await api.call('POST', `/inbox/threads/${foreign.id}/reply`, { text: 'x' })).status).toBe(404);
    });
  });

  describe('leads and calendar for the app', () => {
    it('returns the updated lead, its history and campaigns, and takes notes', async () => {
      const created = await api.call('POST', '/leads', { firstName: 'Rita', companyName: 'Rita Cosméticos', email: 'rita@cosmeticos.test', phone: '11 98888-7777' });
      const id = created.json.id;

      const patched = await api.call('PATCH', `/leads/${id}`, { status: 'QUALIFIED', score: 80 });
      expect(patched.status).toBe(200);
      expect(patched.json).toMatchObject({ id, status: 'QUALIFIED', score: 80, firstName: 'Rita' });
      expect((await api.call('PATCH', '/leads/00000000-0000-4000-8000-000000000000', { status: 'WON' })).status).toBe(404);
      expect((await api.call('PATCH', '/leads/xyz', { status: 'WON' })).status).toBe(404);

      expect((await api.call('POST', `/leads/${id}/notes`, { body: 'Ligar na quinta de manhã.' })).status).toBe(201);
      expect((await api.call('POST', `/leads/${id}/notes`, { body: '' })).status).toBe(400);

      const mailbox = await prisma.emailMailbox.findFirstOrThrow({ where: { tenantId } });
      const campaign = await api.call('POST', '/campaigns', { name: 'Detalhe', channel: 'EMAIL', emailMailboxId: mailbox.id });
      await api.call('POST', `/campaigns/${campaign.json.id}/steps`, { position: 1, channel: 'EMAIL', body: 'oi' });
      await api.call('POST', `/campaigns/${campaign.json.id}/enroll`, { leadIds: [id] });

      const detail = await api.call('GET', `/leads/${id}`);
      expect(detail.status).toBe(200);
      expect(detail.json.activities[0]).toMatchObject({ type: 'note', body: 'Ligar na quinta de manhã.' });
      expect(detail.json.enrollments).toEqual([expect.objectContaining({ status: 'PAUSED', campaign: expect.objectContaining({ name: 'Detalhe' }) })]);
      expect((await api.call('GET', '/leads/not-a-uuid')).status).toBe(404);
    });

    it('filters the calendar by period', async () => {
      const day = (offset: number, hour = 10) => {
        const date = new Date(Date.now() + offset * 86_400_000);
        date.setUTCHours(hour, 0, 0, 0);
        return date;
      };
      const make = (title: string, start: Date, hours = 1) => api.call('POST', '/calendar', { title, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + hours * 3_600_000).toISOString() });
      await make('Ontem', day(-1));
      await make('Hoje', day(0));
      await make('Em 5 dias', day(5));
      await make('Virada', day(2, 22), 8); // starts day 2, ends day 3

      const window = await api.call('GET', `/calendar?from=${encodeURIComponent(day(3, 0).toISOString())}&to=${encodeURIComponent(day(6).toISOString())}`);
      expect(window.json.map((event: any) => event.title)).toEqual(['Virada', 'Em 5 dias']);
      expect((await api.call('GET', '/calendar')).json.length).toBeGreaterThanOrEqual(4);
      expect((await api.call('GET', '/calendar?from=ontem')).status).toBe(400);
    });
  });
});
