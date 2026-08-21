const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

let token = '';
let refreshPromise: Promise<string> | null = null;

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

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        const data = await response.json();
        if (!data?.accessToken) throw new Error('missing_access_token');
        token = data.accessToken;
        return token;
      })
      .catch((error) => {
        token = '';
        emitAuthExpired();
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

  if (response.status === 401 && path !== '/auth/refresh' && allowRefresh) {
    await refreshAccessToken();
    return request(path, init, false);
  }

  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/refresh') {
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
    await refreshAccessToken();
    return { accessToken: token };
  }

  return request(path, init, true);
}
