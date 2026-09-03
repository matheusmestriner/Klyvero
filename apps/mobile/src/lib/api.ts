import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const BASE: string = (Constants.expoConfig?.extra as any)?.apiUrl ?? 'https://klyvero-api-free.onrender.com/api/v1';

const TOKEN_KEY = 'klyvero.accessToken';
const TENANT_KEY = 'klyvero.tenantSlug';

let accessToken: string | null = null;
let tenantSlug: string | null = null;
let onExpire: (() => void) | null = null;

// This backend's /auth/refresh reads an httpOnly, SameSite=strict cookie set
// by a browser -- a bare fetch() from React Native never carries or persists
// that cookie, so there is no silent refresh path here yet (that would mean
// changing the API to also accept a refresh token outside a cookie, which is
// a deliberate follow-up, not something to smuggle into a design/reskin
// pass). Until then the access token (15 min TTL) is the whole session: kept
// in SecureStore so the app doesn't force a login on every cold start within
// that window, and any 401 from the API cleanly drops the user back to the
// login screen instead of retrying forever.
export const session = {
  async load() {
    accessToken = await SecureStore.getItemAsync(TOKEN_KEY);
    tenantSlug = await SecureStore.getItemAsync(TENANT_KEY);
    return { accessToken, tenantSlug };
  },
  async set(token: string, slug: string) {
    accessToken = token;
    tenantSlug = slug;
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(TENANT_KEY, slug);
  },
  async clear() {
    accessToken = null;
    tenantSlug = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(TENANT_KEY);
  },
  get() {
    return accessToken;
  },
  getTenantSlug() {
    return tenantSlug;
  },
  onExpire(fn: () => void) {
    onExpire = fn;
  },
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readError(response: Response) {
  const text = await response.text();
  if (!text) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(text);
    return parsed?.message || parsed?.error || text;
  } catch {
    return text;
  }
}

export async function api(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${BASE}${path}`, { ...init, headers });

  if (response.status === 401) {
    await session.clear();
    onExpire?.();
    throw new ApiError('Sessão expirada. Entre novamente.', 401);
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export { BASE as API_BASE_URL };
