import { API_BASE } from './config';
import { getItem, removeItem, setItem } from './storage';

export type SessionUser = { id: string; name: string; email: string; role: string; tenantId: string };
export type Session = { user: SessionUser; tenant: { id: string; name: string; slug: string } };

type AuthResponse = Session & { accessToken: string; refreshToken: string };

const REFRESH_KEY = 'klyvero.refreshToken';
const SESSION_KEY = 'klyvero.session';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: (() => void) | null = null;

/** The session provider registers here so a failed refresh sends the user back to the login screen. */
export function setSignedOutHandler(handler: (() => void) | null) {
  onSignedOut = handler;
}

const MOBILE_HEADERS = { 'content-type': 'application/json', 'x-klyvero-client': 'mobile' };

async function readError(response: Response) {
  const body = await response.json().catch(() => null);
  const message = body?.message;
  return Array.isArray(message) ? message.join('\n') : typeof message === 'string' ? message : `Erro ${response.status}`;
}

async function post<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...MOBILE_HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, await readError(response));
  return (await response.json().catch(() => ({}))) as T;
}

async function remember(auth: AuthResponse) {
  accessToken = auth.accessToken;
  await setItem(REFRESH_KEY, auth.refreshToken);
  await setItem(SESSION_KEY, JSON.stringify({ user: auth.user, tenant: auth.tenant } satisfies Session));
}

export async function signIn(input: { tenantSlug: string; email: string; password: string }): Promise<Session> {
  const auth = await post<AuthResponse>('/auth/login', {
    tenantSlug: input.tenantSlug.trim().toLowerCase(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });
  await remember(auth);
  return { user: auth.user, tenant: auth.tenant };
}

/** Rotating refresh tokens: a token is single-use, so concurrent 401s must share one refresh call. */
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const token = await getItem(REFRESH_KEY);
      if (!token) return false;
      await remember(await post<AuthResponse>('/auth/refresh', { refreshToken: token }));
      return true;
    } catch (error) {
      // Offline or server down: keep the stored token and let the caller fail; only a rejection ends the session.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        await clearSession();
        return false;
      }
      throw error;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Restores the stored session at app start. Returns null when there is none or it was rejected. */
export async function restoreSession(): Promise<Session | null> {
  const raw = await getItem(SESSION_KEY);
  if (!raw || !(await getItem(REFRESH_KEY))) return null;
  try {
    if (!(await refresh())) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

async function clearSession() {
  accessToken = null;
  await removeItem(REFRESH_KEY);
  await removeItem(SESSION_KEY);
}

export async function signOut() {
  const token = await getItem(REFRESH_KEY);
  await clearSession();
  if (token) await post('/auth/logout', { refreshToken: token }).catch(() => undefined);
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const call = () =>
    fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: { ...MOBILE_HEADERS, ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  let response = await call();
  if (response.status === 401 && (await refresh())) response = await call();
  if (response.status === 401) {
    onSignedOut?.();
    throw new ApiError(401, 'Sessão expirada');
  }
  if (!response.ok) throw new ApiError(response.status, await readError(response));
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
