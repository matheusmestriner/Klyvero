import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { Api, BOOTSTRAP_TOKEN, FakeSmtp, bootApp, resetDatabase, startFakeSmtp, testDatabaseUrl } from '../../testing/e2e';

const CNPJ = '11.222.333/0001-81';
const CNPJ_OTHER = '00.000.000/0001-91';
const CPF = '529.982.247-25';
const PASSWORD = 'OwnerPassw0rd!!';

describe('owner sign-up by single-use invite (e2e)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
  let app: NestExpressApplication;
  let base = '';
  let platform: Api;
  let smtp: FakeSmtp;
  let platformId = '';

  const anonymous = () => new Api(base);
  const tokenOf = (url: string) => new URL(url).searchParams.get('token') as string;
  const invite = async (body: Record<string, unknown> = { label: 'Acme Marketing' }) => {
    const out = await platform.call('POST', '/signup-invites', body);
    expect(out.status).toBe(201);
    return { ...out.json, token: tokenOf(out.json.url) } as { id: string; url: string; token: string };
  };
  const form = (token: string, over: Record<string, unknown> = {}) => ({
    token,
    companyName: 'Acme Marketing Ltda',
    document: CNPJ,
    responsibleName: 'Maria Souza',
    email: 'maria@acme-marketing.test',
    password: PASSWORD,
    slug: 'acme-marketing',
    productName: 'AcmeSales',
    primaryColor: '#ff6600',
    ...over,
  });
  const until = async (check: () => boolean, ms = 4000) => {
    for (let waited = 0; waited < ms; waited += 50) {
      if (check()) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  };

  beforeAll(async () => {
    await resetDatabase(prisma);
    smtp = await startFakeSmtp();
    const booted = await bootApp({ SMTP_DEFAULT_HOST: '127.0.0.1', SMTP_DEFAULT_PORT: String(smtp.port), SMTP_DEFAULT_FROM: 'no-reply@klyvero.test' });
    app = booted.app;
    base = booted.base;
    platform = anonymous();
    const created = await platform.call('POST', '/auth/bootstrap', { bootstrapToken: BOOTSTRAP_TOKEN, tenantName: 'Klyvero', tenantSlug: 'klyvero-hq', name: 'Dono', email: 'dono@klyvero.test', password: PASSWORD });
    if (created.status !== 201) throw new Error(`bootstrap failed: ${created.status} ${JSON.stringify(created.json)}`);
    platformId = created.json.tenant.id;
    await platform.login('klyvero-hq', 'dono@klyvero.test', PASSWORD);
  });

  afterAll(async () => {
    await app?.close();
    await smtp?.close();
    await prisma.$disconnect();
  });

  it('issues a link once, stores only its hash, and lists it as pending', async () => {
    const created = await invite({ label: 'Lista', validityDays: 3 });
    expect(created.url).toMatch(/\/cadastro\?token=[A-Za-z0-9_-]{40,}$/);
    const row = await prisma.signupInvite.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.tokenHash).not.toContain(created.token);
    const list = await platform.call('GET', '/signup-invites');
    expect(list.json.find((item: any) => item.id === created.id)).toMatchObject({ label: 'Lista', status: 'PENDING', tenant: null });
    expect(JSON.stringify(list.json)).not.toContain(created.token);
  });

  it('shows the invitee who the link is for without needing a session', async () => {
    const { token } = await invite({ label: 'Para a Acme', email: 'maria@acme-marketing.test' });
    const checked = await anonymous().call('POST', '/signup/invite/check', { token });
    expect(checked.status).toBe(200);
    expect(checked.json).toMatchObject({ label: 'Para a Acme', email: 'maria@acme-marketing.test', platformName: 'Klyvero' });
    expect((await anonymous().call('POST', '/signup/invite/check', { token: 'x'.repeat(43) })).status).toBe(404);
  });

  it('creates a reseller workspace with its owner, brand and welcome mail, and burns the link', async () => {
    const { id, token } = await invite({ label: 'Acme', email: 'MARIA@acme-marketing.test' });
    smtp.mails.length = 0;
    const out = await anonymous().call('POST', '/signup', form(token));
    expect(out.status).toBe(201);
    expect(out.json).toEqual({ tenant: { name: 'Acme Marketing Ltda', slug: 'acme-marketing' }, user: { email: 'maria@acme-marketing.test' } });

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'acme-marketing' }, include: { branding: true, users: true, pipelines: true } });
    expect(tenant).toMatchObject({ type: 'RESELLER', parentTenantId: platformId, legalDocument: '11222333000181', status: 'ACTIVE' });
    expect(tenant.branding).toMatchObject({ productName: 'AcmeSales', companyName: 'Acme Marketing Ltda', primaryColor: '#ff6600', inheritFromParent: true });
    expect(tenant.users).toHaveLength(1);
    expect(tenant.users[0]).toMatchObject({ role: 'OWNER', email: 'maria@acme-marketing.test', name: 'Maria Souza' });
    expect(tenant.users[0].passwordHash).not.toContain(PASSWORD);
    expect(tenant.pipelines).toHaveLength(1);

    // The owner signs in with the workspace they chose and sees their own brand.
    const owner = anonymous();
    const login = await owner.login('acme-marketing', 'maria@acme-marketing.test', PASSWORD);
    expect(login.user.role).toBe('OWNER');
    const branding = await owner.call('GET', '/branding/me');
    expect(branding.json.branding.productName).toBe('AcmeSales');
    expect(branding.json.branding.primaryColor).toBe('#ff6600');
    expect(branding.json.tenant.slug).toBe('acme-marketing');
    // ...and can keep editing it (white label).
    expect((await owner.call('PUT', '/branding/me', { productName: 'AcmeSales Pro' })).status).toBe(200);

    // The platform sees the new workspace under it, and the invite as used.
    const tenants = await platform.call('GET', '/tenants');
    expect(tenants.json.find((row: any) => row.slug === 'acme-marketing')).toMatchObject({ type: 'RESELLER', parentTenantId: platformId });
    const listed = (await platform.call('GET', '/signup-invites')).json.find((item: any) => item.id === id);
    expect(listed).toMatchObject({ status: 'USED', tenant: { slug: 'acme-marketing' } });

    expect(await until(() => smtp.mails.length > 0)).toBe(true);
    expect(smtp.mails[0].to?.text ?? '').toContain('maria@acme-marketing.test');
    expect(smtp.mails[0].text).toContain('acme-marketing');

    // The link is single use.
    expect((await anonymous().call('POST', '/signup', form(token, { email: 'outra@acme.test', document: CNPJ_OTHER, slug: 'outra' }))).status).toBe(400);
    expect((await anonymous().call('POST', '/signup/invite/check', { token })).status).toBe(404);
  });

  it('allows one registration per e-mail and per document, and gives the link back when it fails', async () => {
    const { token, id } = await invite();
    const sameEmail = await anonymous().call('POST', '/signup', form(token, { document: CNPJ_OTHER, slug: 'outro-slug' }));
    expect(sameEmail.status).toBe(409);
    expect(sameEmail.json.message).toMatch(/e-mail/);
    const sameDocument = await anonymous().call('POST', '/signup', form(token, { email: 'novo@acme.test', slug: 'outro-slug' }));
    expect(sameDocument.status).toBe(409);
    expect(sameDocument.json.message).toMatch(/CPF\/CNPJ/);
    const sameSlug = await anonymous().call('POST', '/signup', form(token, { email: 'novo@acme.test', document: CNPJ_OTHER }));
    expect(sameSlug.status).toBe(409);
    expect(sameSlug.json.message).toMatch(/workspace/);
    expect((await prisma.signupInvite.findUniqueOrThrow({ where: { id } })).usedAt).toBeNull();

    // A person (CPF) can register too, once the data is free.
    const ok = await anonymous().call('POST', '/signup', form(token, { email: 'joao@freela.test', document: CPF, slug: 'joao-freela', companyName: 'João Freela', productName: undefined, primaryColor: undefined }));
    expect(ok.status).toBe(201);
    const branding = await prisma.tenantBranding.findFirstOrThrow({ where: { tenant: { slug: 'joao-freela' } } });
    expect(branding.productName).toBeNull();
  });

  it('rejects bad documents, reserved slugs, weak passwords and a different e-mail than the invite names', async () => {
    const { token } = await invite({ label: 'Validações', email: 'dona@empresa.test' });
    const send = (over: Record<string, unknown>) => anonymous().call('POST', '/signup', form(token, { email: 'dona@empresa.test', document: CNPJ_OTHER, slug: 'empresa-x', ...over }));
    expect((await send({ document: '11.222.333/0001-80' })).json.message).toMatch(/CPF ou CNPJ/);
    expect((await send({ slug: 'admin' })).status).toBe(400);
    expect((await send({ slug: 'Com Espaço' })).status).toBe(400);
    expect((await send({ password: 'curta' })).status).toBe(400);
    expect((await send({ primaryColor: 'laranja' })).status).toBe(400);
    expect((await send({ email: 'intruso@empresa.test' })).json.message).toMatch(/e-mail para o qual o convite/);
    expect((await send({ extra: 'campo desconhecido' })).status).toBe(400);
    expect((await send({})).status).toBe(201);
  });

  it('lets only one of two simultaneous registrations through', async () => {
    const { token } = await invite();
    const [a, b] = await Promise.all([
      anonymous().call('POST', '/signup', form(token, { email: 'a@corrida.test', document: '45.000.001/0001-74', slug: 'corrida-a', companyName: 'Corrida A' })),
      anonymous().call('POST', '/signup', form(token, { email: 'b@corrida.test', document: '123.456.789-09', slug: 'corrida-b', companyName: 'Corrida B' })),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);
    expect(await prisma.tenant.count({ where: { slug: { in: ['corrida-a', 'corrida-b'] } } })).toBe(1);
  });

  it('refuses revoked and expired links', async () => {
    const revoked = await invite();
    expect((await platform.call('DELETE', `/signup-invites/${revoked.id}`)).status).toBe(200);
    expect((await platform.call('DELETE', `/signup-invites/${revoked.id}`)).status).toBe(404);
    expect((await anonymous().call('POST', '/signup/invite/check', { token: revoked.token })).status).toBe(404);
    expect((await anonymous().call('POST', '/signup', form(revoked.token, { email: 'r@x.test', slug: 'revogado' }))).status).toBe(400);

    const expired = await invite();
    await prisma.signupInvite.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await anonymous().call('POST', '/signup/invite/check', { token: expired.token })).status).toBe(404);
    const list = await platform.call('GET', '/signup-invites');
    expect(list.json.find((item: any) => item.id === expired.id).status).toBe('EXPIRED');
    expect(list.json.find((item: any) => item.id === revoked.id).status).toBe('REVOKED');
  });

  it('keeps invites to the platform owner side', async () => {
    expect((await anonymous().call('GET', '/signup-invites')).status).toBe(401);
    // The reseller created above must not mint invites for itself or anyone else.
    const reseller = anonymous();
    await reseller.login('acme-marketing', 'maria@acme-marketing.test', PASSWORD);
    expect((await reseller.call('POST', '/signup-invites', { label: 'Sub' })).status).toBe(403);
    expect((await reseller.call('GET', '/signup-invites')).status).toBe(403);
    // A member of the platform without OWNER/ADMIN role cannot either.
    await platform.call('POST', `/tenants/${platformId}/users`, { name: 'Vendedor', email: 'sdr@klyvero.test', password: PASSWORD, role: 'SDR' });
    const sdr = anonymous();
    await sdr.login('klyvero-hq', 'sdr@klyvero.test', PASSWORD);
    expect((await sdr.call('POST', '/signup-invites', { label: 'Sub' })).status).toBe(403);
    // Cross-site browsers are refused on the public endpoints.
    const cross = await anonymous().call('POST', '/signup/invite/check', { token: 'x'.repeat(43) }, { origin: 'https://evil.example' });
    expect(cross.status).toBe(403);
  });
});
