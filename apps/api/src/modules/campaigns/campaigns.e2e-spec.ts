import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  Api, BOOTSTRAP_TOKEN, FakeBridge, FakeSmtp, INBOUND_TOKEN, INTERNAL_TOKEN,
  bootApp, resetDatabase, startFakeBridge, startFakeSmtp, testDatabaseUrl,
} from '../../testing/e2e';
import { SequenceScheduler } from './sequence.scheduler';

describe('campaigns (e2e)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
  let app: NestExpressApplication;
  let api: Api;
  let smtp: FakeSmtp;
  let bridge: FakeBridge;
  let scheduler: SequenceScheduler;
  let tenantId = '';
  let mailboxId = '';
  let seq = 0;

  beforeAll(async () => {
    await resetDatabase(prisma);
    smtp = await startFakeSmtp();
    bridge = await startFakeBridge();
    const booted = await bootApp({ WHATSAPP_SERVICE_URL: bridge.url, WHATSAPP_MIN_INTERVAL_SECONDS: '30' });
    app = booted.app;
    api = new Api(booted.base);
    scheduler = app.get(SequenceScheduler);

    const created = await api.call('POST', '/auth/bootstrap', {
      bootstrapToken: BOOTSTRAP_TOKEN, tenantName: 'Acme', tenantSlug: 'acme', name: 'Owner', email: 'owner@acme.test', password: 'OwnerPassw0rd!!',
    });
    tenantId = created.json.tenant.id;
    await api.login('acme', 'owner@acme.test', 'OwnerPassw0rd!!');
    const mailbox = await api.call('POST', '/email/mailboxes', {
      name: 'Principal', host: '127.0.0.1', port: smtp.port, secure: false, fromAddress: 'vendas@klyvero.test', fromName: 'Vendas',
    });
    expect(mailbox.status).toBe(201);
    mailboxId = mailbox.json.id;
  });

  afterAll(async () => {
    await app?.close();
    await smtp?.close();
    await bridge?.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    smtp.mails.length = 0;
    smtp.failNext = 0;
    bridge.sent.length = 0;
  });

  // Whatever a test left running must not leak into the next one.
  afterEach(async () => {
    await prisma.campaign.updateMany({ data: { status: 'ARCHIVED' } });
  });

  const uid = () => `${Date.now().toString(36)}${(seq += 1)}`;

  async function lead(over: Record<string, unknown> = {}) {
    const id = uid();
    const out = await api.call('POST', '/leads', { firstName: `Nome${id}`, companyName: `Empresa ${id}`, email: `lead${id}@x.test`, ...over });
    expect(out.status).toBe(201);
    return out.json as { id: string; email: string | null; phone: string | null; firstName: string };
  }

  async function campaign(channel: 'EMAIL' | 'WHATSAPP' | 'MULTICHANNEL' = 'EMAIL', withMailbox = true) {
    const out = await api.call('POST', '/campaigns', { name: `Campanha ${uid()}`, channel, ...(withMailbox ? { emailMailboxId: mailboxId } : {}) });
    expect(out.status).toBe(201);
    return out.json.id as string;
  }

  async function step(campaignId: string, position: number, delayMinutes: number, channel: 'EMAIL' | 'WHATSAPP', body: string, subject?: string) {
    const out = await api.call('POST', `/campaigns/${campaignId}/steps`, { position, delayMinutes, channel, body, ...(subject ? { subject } : {}) });
    expect(out.status).toBe(201);
    return out.json;
  }

  const enroll = (campaignId: string, ...leads: { id: string }[]) => api.call('POST', `/campaigns/${campaignId}/enroll`, { leadIds: leads.map((l) => l.id) });
  const start = (campaignId: string) => api.call('POST', `/campaigns/${campaignId}/start`);
  const makeDue = (position?: number) =>
    prisma.sequenceStepRun.updateMany({ where: { status: 'QUEUED', ...(position ? { step: { position } } : {}) }, data: { scheduledAt: new Date(Date.now() - 1000) } });
  // Runs come back in step order (dates can be shuffled by makeDue()).
  const enrollmentOf = async (campaignId: string, leadId: string) => {
    const row = await prisma.sequenceEnrollment.findFirstOrThrow({ where: { campaignId, leadId }, include: { runs: { include: { step: true } } } });
    row.runs.sort((a, b) => a.step.position - b.step.position);
    return row;
  };
  const mailTo = (address: string) => smtp.mails.find((mail) => JSON.stringify(mail.to).includes(address));

  it('sends step 1 right away with variables and an unsubscribe link, then waits for the delay', async () => {
    const ana = await lead({ firstName: 'Ana', companyName: 'Padaria Sol', email: 'ana@sol.test' });
    const onlyPhone = await lead({ email: undefined, phone: '(11) 99999-0001' });
    const caio = await lead({ firstName: 'Caio', email: 'caio@sol.test' });
    const id = await campaign();
    await step(id, 1, 0, 'EMAIL', 'Oi {{firstName}} da {{companyName}}', 'Olá {{firstName}}');
    await step(id, 2, 60, 'EMAIL', 'Segundo contato');

    expect((await enroll(id, ana, onlyPhone, caio)).json).toEqual({ enrolled: 2, alreadyEnrolled: 0, withoutContact: 1 });
    expect((await enroll(id, ana, caio)).json).toEqual({ enrolled: 0, alreadyEnrolled: 2, withoutContact: 0 });

    expect(await scheduler.runDue()).toBe(0); // draft campaigns never send
    expect(smtp.mails).toHaveLength(0);

    const started = await start(id);
    expect(started.json).toMatchObject({ ok: true, scheduled: 2, completed: 0, warnings: [] });
    expect(await scheduler.runDue()).toBe(2);

    expect(smtp.mails).toHaveLength(2);
    const mail = mailTo('ana@sol.test')!;
    expect(mail.subject).toBe('Olá Ana');
    expect(mail.text).toContain('Oi Ana da Padaria Sol');
    expect(mail.text).toContain('Para não receber mais e-mails como este');
    expect(mail.text).toContain('/api/v1/email/unsubscribe/');
    const headerNames = mail.headerLines.map((line) => line.key);
    expect(headerNames).toEqual(expect.arrayContaining(['list-unsubscribe', 'list-unsubscribe-post']));

    const enrollment = await enrollmentOf(id, ana.id);
    expect(enrollment.status).toBe('ACTIVE');
    expect(enrollment.currentPosition).toBe(1);
    expect(enrollment.nextRunAt!.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect(enrollment.runs.map((run) => run.status)).toEqual(['SENT', 'QUEUED']);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: ana.id } })).status).toBe('CONTACTED');
    expect(await prisma.leadActivity.count({ where: { leadId: ana.id, type: 'campaign.email.sent' } })).toBe(1);

    expect(await scheduler.runDue()).toBe(0); // step 2 is not due yet
    expect(smtp.mails).toHaveLength(2);
  });

  it('stops the sequence for whoever replies and still finishes it for everyone else', async () => {
    const dora = await lead({ email: 'dora@x.test' });
    const edu = await lead({ email: 'edu@x.test' });
    const id = await campaign();
    await step(id, 1, 0, 'EMAIL', 'Primeiro');
    await step(id, 2, 60, 'EMAIL', 'Segundo');
    await enroll(id, dora, edu);
    await start(id);
    await scheduler.runDue();
    smtp.mails.length = 0;

    const reply = await api.call('POST', '/email/inbound', { tenantId, from: 'dora@x.test', to: 'vendas@klyvero.test', subject: 'Re', text: 'Tenho interesse' }, { 'x-inbound-token': INBOUND_TOKEN });
    expect(reply.status).toBe(201);
    expect((await enrollmentOf(id, dora.id)).status).toBe('REPLIED');
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: dora.id } })).status).toBe('REPLIED');

    await makeDue();
    expect(await scheduler.runDue()).toBe(1);
    expect(smtp.mails).toHaveLength(1);
    expect(mailTo('edu@x.test')).toBeTruthy();
    expect((await enrollmentOf(id, edu.id)).status).toBe('COMPLETED');
    expect((await enrollmentOf(id, dora.id)).runs[1].status).toBe('QUEUED'); // never ran

    const bad = await api.call('POST', '/email/inbound', { tenantId, from: 'edu@x.test', to: 'x@x.test' }, { 'x-inbound-token': 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('pause holds the queue and starting again resumes it', async () => {
    const fabio = await lead();
    const id = await campaign();
    await step(id, 1, 0, 'EMAIL', 'Olá');
    await enroll(id, fabio);
    await start(id);
    expect((await api.call('POST', `/campaigns/${id}/pause`)).json).toEqual({ ok: true });

    expect(await scheduler.runDue()).toBe(0);
    expect(smtp.mails).toHaveLength(0);
    expect((await enrollmentOf(id, fabio.id)).status).toBe('PAUSED');

    expect((await start(id)).json).toMatchObject({ scheduled: 1 });
    expect(await scheduler.runDue()).toBe(1);
    expect(smtp.mails).toHaveLength(1);
    expect((await enrollmentOf(id, fabio.id)).status).toBe('COMPLETED');
  });

  it('unsubscribing stops running sequences, and suppressed addresses are skipped, not failed', async () => {
    const gil = await lead({ email: 'gil@x.test' });
    const id = await campaign();
    await step(id, 1, 0, 'EMAIL', 'Um');
    await step(id, 2, 60, 'EMAIL', 'Dois');
    await enroll(id, gil);
    await start(id);
    await scheduler.runDue();
    expect(smtp.mails).toHaveLength(1);

    expect((await api.call('POST', '/email/suppressions', { email: 'GIL@x.test', reason: 'UNSUBSCRIBE' })).status).toBe(201);
    expect((await enrollmentOf(id, gil.id)).status).toBe('STOPPED');
    await makeDue();
    expect(await scheduler.runDue()).toBe(0);
    expect(smtp.mails).toHaveLength(1);

    const helena = await lead({ email: 'helena@x.test' });
    await api.call('POST', '/email/suppressions', { email: 'helena@x.test' });
    const solo = await campaign();
    await step(solo, 1, 0, 'EMAIL', 'Único');
    await enroll(solo, helena);
    await start(solo);
    expect(await scheduler.runDue()).toBe(1);
    expect(smtp.mails).toHaveLength(1); // nothing new
    const enrollment = await enrollmentOf(solo, helena.id);
    expect(enrollment.runs[0]).toMatchObject({ status: 'SKIPPED', error: 'Destinatário descadastrado' });
    expect(enrollment.status).toBe('COMPLETED');
  });

  it('retries with backoff, fails after three attempts, and a manual retry recovers', async () => {
    const igor = await lead({ email: 'igor@x.test' });
    const id = await campaign();
    await step(id, 1, 0, 'EMAIL', 'Olá');
    await enroll(id, igor);
    await start(id);
    smtp.failNext = 3;

    await scheduler.runDue();
    let run = (await enrollmentOf(id, igor.id)).runs[0];
    expect(run).toMatchObject({ status: 'QUEUED', attempts: 1 });
    expect(run.scheduledAt.getTime()).toBeGreaterThan(Date.now() + 50_000); // ~60 s backoff
    expect(run.error).toBeTruthy();

    await makeDue();
    await scheduler.runDue();
    run = (await enrollmentOf(id, igor.id)).runs[0];
    expect(run).toMatchObject({ status: 'QUEUED', attempts: 2 });
    expect(run.scheduledAt.getTime()).toBeGreaterThan(Date.now() + 110_000); // ~120 s backoff

    await makeDue();
    await scheduler.runDue();
    const failed = await enrollmentOf(id, igor.id);
    expect(failed.status).toBe('FAILED');
    expect(failed.lastError).toBeTruthy();
    expect(failed.runs[0]).toMatchObject({ status: 'FAILED', attempts: 3 });
    expect(smtp.mails).toHaveLength(0);

    const retried = await api.call('POST', `/campaigns/${id}/enrollments/${failed.id}/retry`);
    expect(retried.json).toMatchObject({ status: 'ACTIVE', lastError: null });
    expect(await scheduler.runDue()).toBe(1);
    expect(smtp.mails).toHaveLength(1);
    expect((await enrollmentOf(id, igor.id)).status).toBe('COMPLETED');
  });

  it('WhatsApp waits for a session, normalizes numbers, spaces sends, and stops on a reply without the ninth digit', async () => {
    const julia = await lead({ email: undefined, phone: '(11) 99999-0000' });
    const kaue = await lead({ email: undefined, phone: '+55 11 98888-1111' });
    const id = await campaign('WHATSAPP', false);
    await step(id, 1, 0, 'WHATSAPP', 'Oi {{firstName}}');
    await step(id, 2, 60, 'WHATSAPP', 'Segundo');
    await enroll(id, julia, kaue);

    const started = await start(id);
    expect(started.json.warnings[0]).toMatch(/WhatsApp/);
    await scheduler.runDue();
    expect(bridge.sent).toHaveLength(0);
    let first = (await enrollmentOf(id, julia.id)).runs[0];
    expect(first).toMatchObject({ status: 'QUEUED', attempts: 0 });
    expect(first.error).toMatch(/sessão/);
    expect((await enrollmentOf(id, julia.id)).status).toBe('ACTIVE'); // waiting is not failing

    await prisma.whatsappConnection.create({ data: { tenantId, sessionId: 'principal', connected: true, loggedIn: true } });
    await makeDue(1);
    await scheduler.runDue();
    expect(bridge.sent).toHaveLength(1); // the second send waits out the spacing
    const queued = await prisma.sequenceStepRun.findMany({ where: { status: 'QUEUED', step: { position: 1 }, enrollment: { campaignId: id } } });
    expect(queued).toHaveLength(1);
    expect(queued[0].scheduledAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(queued[0].attempts).toBe(0);

    await prisma.sequenceStepRun.updateMany({ where: { status: 'SENT', step: { channel: 'WHATSAPP' } }, data: { finishedAt: new Date(Date.now() - 60_000) } });
    await makeDue(1);
    await scheduler.runDue();
    expect(bridge.sent.map((message) => message.to).sort()).toEqual(['5511988881111', '5511999990000']);
    expect(bridge.sent[0]).toMatchObject({ sessionId: 'principal' });
    expect(bridge.sent[0].text).toMatch(/^Oi Nome/);

    const event = await api.call('POST', '/internal/whatsapp/events', {
      type: 'message', tenantId, sessionId: 'principal', id: `in-${uid()}`, from: '551199990000@s.whatsapp.net', text: 'oi, quero saber mais',
    }, { 'x-internal-token': INTERNAL_TOKEN });
    expect(event.status).toBe(201);
    expect((await enrollmentOf(id, julia.id)).status).toBe('REPLIED');
    expect((await enrollmentOf(id, kaue.id)).status).toBe('ACTIVE');
  });

  it('a manual stop cancels what was still queued', async () => {
    const lia = await lead();
    const id = await campaign();
    await step(id, 1, 0, 'EMAIL', 'Um');
    await step(id, 2, 60, 'EMAIL', 'Dois');
    await enroll(id, lia);
    await start(id);
    await scheduler.runDue();

    const enrollment = await enrollmentOf(id, lia.id);
    const stopped = await api.call('POST', `/campaigns/${id}/enrollments/${enrollment.id}/stop`);
    expect(stopped.json).toMatchObject({ status: 'STOPPED', nextRunAt: null });
    expect((await enrollmentOf(id, lia.id)).runs.map((run) => run.status)).toEqual(['SENT', 'CANCELED']);
  });

  it('two scheduler passes at once never send the same step twice', async () => {
    const people = await Promise.all(Array.from({ length: 8 }, () => lead()));
    const id = await campaign();
    await step(id, 1, 0, 'EMAIL', 'Olá');
    await enroll(id, ...people);
    await start(id);

    const results = await Promise.all([scheduler.runDue(), scheduler.runDue(), scheduler.runDue()]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(8);
    expect(smtp.mails).toHaveLength(8);
    expect(new Set(smtp.mails.map((mail) => JSON.stringify(mail.to))).size).toBe(8);
  });

  it('lists per-campaign numbers', async () => {
    const out = await api.call('GET', '/campaigns');
    expect(out.status).toBe(200);
    const withMail = out.json.find((c: any) => c.stats.sent > 0);
    expect(withMail.stats).toEqual(expect.objectContaining({ active: expect.any(Number), replied: expect.any(Number), sent: expect.any(Number) }));
    expect(out.json.some((c: any) => c.stats.replied === 1)).toBe(true);
  });

  describe('guards', () => {
    it('keeps channels, mailbox and state consistent', async () => {
      const emailOnly = await campaign('EMAIL');
      expect((await api.call('POST', `/campaigns/${emailOnly}/steps`, { position: 1, channel: 'WHATSAPP', body: 'x' })).status).toBe(400);

      const noMailbox = await campaign('EMAIL', false);
      await step(noMailbox, 1, 0, 'EMAIL', 'x');
      const refused = await start(noMailbox);
      expect(refused.status).toBe(400);
      expect(refused.json.message).toMatch(/mailbox/i);
      expect((await start(await campaign('EMAIL'))).status).toBe(400); // no steps

      const running = await campaign();
      const stepRow = await step(running, 1, 0, 'EMAIL', 'x');
      await start(running);
      expect((await api.call('DELETE', `/campaigns/${running}`)).status).toBe(400);
      expect((await api.call('DELETE', `/campaigns/${running}/steps/${stepRow.id}`)).status).toBe(400);
      await api.call('POST', `/campaigns/${running}/pause`);
      expect((await api.call('DELETE', `/campaigns/${running}/steps/${stepRow.id}`)).status).toBe(200);
      expect((await api.call('PATCH', `/campaigns/${running}`, { name: 'Renomeada' })).json.name).toBe('Renomeada');
      expect((await api.call('DELETE', `/campaigns/${running}`)).json).toEqual({ deleted: true });
    });

    it('validates ids and payloads', async () => {
      const id = await campaign();
      expect((await api.call('POST', `/campaigns/${id}/enroll`, { leadIds: ['nope'] })).status).toBe(400);
      expect((await api.call('POST', `/campaigns/${id}/enroll`, { leadIds: [] })).status).toBe(400);
      expect((await api.call('POST', '/campaigns/not-a-uuid/start')).status).toBe(400);
      expect((await api.call('POST', '/campaigns/00000000-0000-4000-8000-000000000000/start')).status).toBe(404);
      expect((await api.call('POST', '/campaigns', { name: 'x', channel: 'EMAIL', extra: 1 })).status).toBe(400);
    });

    it('isolates tenants and enforces roles', async () => {
      const mine = await campaign();
      const other = await prisma.tenant.create({ data: { name: 'Outra', slug: 'outra', type: 'CUSTOMER' } });
      await prisma.user.create({ data: { tenantId: other.id, email: 'dono@outra.test', name: 'Dono', role: 'OWNER', passwordHash: await argon2.hash('OutraSenha123!') } });
      const stranger = new Api(api.base);
      await stranger.login('outra', 'dono@outra.test', 'OutraSenha123!');
      expect((await stranger.call('GET', '/campaigns')).json).toEqual([]);
      expect((await stranger.call('POST', `/campaigns/${mine}/start`)).status).toBe(404);
      expect((await stranger.call('GET', `/campaigns/${mine}/enrollments`)).status).toBe(404);

      const created = await api.call('POST', `/tenants/${tenantId}/users`, { name: 'Leitor', email: 'viewer@acme.test', password: 'ViewerPass123!!', role: 'VIEWER' });
      expect(created.status).toBe(201);
      const viewer = new Api(api.base);
      await viewer.login('acme', 'viewer@acme.test', 'ViewerPass123!!');
      expect((await viewer.call('GET', '/campaigns')).status).toBe(200);
      expect((await viewer.call('POST', '/campaigns', { name: 'Nao', channel: 'EMAIL' })).status).toBe(403);
      expect((await viewer.call('POST', `/campaigns/${mine}/start`)).status).toBe(403);
    });
  });
});
