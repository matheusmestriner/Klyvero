function requireMin(env: Record<string, unknown>, key: string, min: number) {
  const value = String(env[key] ?? '');
  if (value.length < min) throw new Error(`${key} must contain at least ${min} characters`);
  return value;
}

function validateHttpsList(env: Record<string, unknown>, key: string) {
  const raw = String(env[key] ?? '');
  if (!raw) throw new Error(`${key} is required in production`);
  for (const value of raw.split(',').map((item) => item.trim()).filter(Boolean)) {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(`${key} contains an invalid URL`); }
    if (url.protocol !== 'https:') throw new Error(`${key} must use HTTPS in production`);
  }
}

function requireHttps(env: Record<string, unknown>, key: string) {
  const value = String(env[key] ?? '');
  if (!value) throw new Error(`${key} is required in production`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${key} must be a valid URL`); }
  if (url.protocol !== 'https:') throw new Error(`${key} must use HTTPS in production`);
}

export function validateEnv(input: Record<string, unknown>) {
  const env = { ...input };
  const prod = String(env.NODE_ENV ?? 'development') === 'production';

  const access = requireMin(env, 'JWT_ACCESS_SECRET', prod ? 64 : 32);
  const refresh = requireMin(env, 'JWT_REFRESH_SECRET', prod ? 64 : 32);
  if (access === refresh) throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');

  const encryption = String(env.SECRET_ENCRYPTION_KEY ?? '');
  let key: Buffer;
  try { key = Buffer.from(encryption, 'base64'); } catch { key = Buffer.alloc(0); }
  if (key.length !== 32) throw new Error('SECRET_ENCRYPTION_KEY must be a base64 encoded 32-byte key');

  if (prod) {
    const bootstrapToken = requireMin(env, 'BOOTSTRAP_TOKEN', 32);
    const whatsappToken = requireMin(env, 'WHATSAPP_INTERNAL_TOKEN', 32);
    const throttleSecret = requireMin(env, 'AUTH_THROTTLE_SECRET', 32);
    const emailLinkSecret = requireMin(env, 'EMAIL_LINK_SIGNING_SECRET', 32);
    const oauthStateSecret = requireMin(env, 'OAUTH_STATE_SECRET', 32);

    const securityContexts = [
      access, refresh, bootstrapToken, whatsappToken, throttleSecret, emailLinkSecret, oauthStateSecret,
    ];
    // Optional break-glass credential for /auth/owner-recovery. Absent = feature disabled.
    if (env.OWNER_RECOVERY_CODE) securityContexts.push(requireMin(env, 'OWNER_RECOVERY_CODE', 32));
    if (new Set(securityContexts).size !== securityContexts.length) {
      throw new Error('Security secrets/tokens must be distinct in production');
    }
    if (env.EMAIL_INBOUND_TOKEN) requireMin(env, 'EMAIL_INBOUND_TOKEN', 32);
    validateHttpsList(env, 'WEB_ORIGIN');
    requireHttps(env, 'API_PUBLIC_URL');
    env.COOKIE_SECURE = 'true';

    const database = String(env.DATABASE_URL ?? '');
    if (!/^postgres(?:ql)?:\/\//i.test(database)) throw new Error('DATABASE_URL must be PostgreSQL in production');
    if (/change-me|password|klyvero:change/i.test(database)) throw new Error('DATABASE_URL appears to contain a default/weak credential');
  }

  env.JWT_ISSUER = String(env.JWT_ISSUER ?? 'klyvero-api');
  env.JWT_AUDIENCE = String(env.JWT_AUDIENCE ?? 'klyvero-web');
  env.BOOTSTRAP_ENABLED = String(env.BOOTSTRAP_ENABLED ?? (prod ? 'false' : 'true'));
  return env;
}
