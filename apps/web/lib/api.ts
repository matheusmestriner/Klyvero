const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type RefreshPayload = {
  accessToken: string;
  user?: unknown;
  [key: string]: unknown;
};

let token = '';
let refreshPromise: Promise<RefreshPayload> | null = null;

export const session = {
  set(value: string) {
    token = value;
  },
  get() {
    return token;
  },
  clear() {
    token = '';
  },
};

function emitAuthExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('klyvero:auth-expired'));
  }
}

function isPublicAuthPath(path: string) {
  return (
    path === '/auth/login' ||
    path === '/auth/forgot-password' ||
    path === '/auth/reset-password' ||
    path === '/auth/bootstrap'
  );
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

async function refreshAccessToken(): Promise<RefreshPayload> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        const data = (await response.json()) as RefreshPayload;
        if (!data?.accessToken) throw new Error('missing_access_token');
        token = data.accessToken;
        return data;
      })
      .catch((error) => {
        token = '';
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function request(path: string, init: RequestInit, allowRefresh: boolean) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const publicAuthPath = isPublicAuthPath(path);

  if (response.status === 401 && path !== '/auth/refresh' && allowRefresh && !publicAuthPath) {
    try {
      await refreshAccessToken();
      return request(path, init, false);
    } catch (error) {
      token = '';
      emitAuthExpired();
      throw error;
    }
  }

  if (!response.ok) {
    // Public authentication flows must surface their own errors instead of
    // being interpreted as an expired authenticated session.
    if (response.status === 401 && !publicAuthPath && path !== '/auth/refresh') {
      token = '';
      emitAuthExpired();
    }
    throw new Error(await readError(response));
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function api(path: string, init: RequestInit = {}) {
  if (path === '/auth/refresh') {
    return refreshAccessToken();
  }

  return request(path, init, true);
}
