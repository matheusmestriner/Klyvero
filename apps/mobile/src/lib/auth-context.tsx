import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { api, session } from './api';
import { buildTheme, Theme, ThemeMode } from '../theme';

export type User = { id: string; name: string; email: string; role: string; tenantId: string };
// Shape of GET /branding/me (BrandingController -> BrandingService.resolveTenantBranding):
// a single object already merged down the tenant hierarchy, not a per-layer split.
export type Branding = {
  tenantId: string;
  tenant: { id: string; name: string; slug: string; type: string };
  branding: {
    productName?: string;
    primaryColor?: string;
    logoUrl?: string;
    compactLogoUrl?: string;
    themeMode?: 'LIGHT' | 'DARK' | 'SYSTEM';
  };
  features: Record<string, { enabled: boolean; config?: unknown }>;
};

type AuthState = {
  ready: boolean;
  user: User | null;
  branding: Branding | null;
  theme: Theme;
  themePreference: ThemeMode | 'system';
  setThemePreference: (mode: ThemeMode | 'system') => void;
  login: (tenantSlug: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [themePreference, setThemePreference] = useState<ThemeMode | 'system'>('system');

  const loadMe = useCallback(async () => {
    const me = await api('/auth/me');
    setUser(me);
    const brandingData = await api('/branding/me').catch(() => null);
    setBranding(brandingData);
  }, []);

  useEffect(() => {
    (async () => {
      const { accessToken } = await session.load();
      if (accessToken) {
        try {
          await loadMe();
        } catch {
          // expired/invalid token -> fall through to login screen
        }
      }
      setReady(true);
    })();
  }, [loadMe]);

  useEffect(() => {
    session.onExpire(() => {
      setUser(null);
      setBranding(null);
    });
  }, []);

  const login = useCallback(
    async (tenantSlug: string, email: string, password: string) => {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ tenantSlug, email, password }),
      });
      await session.set(data.accessToken, tenantSlug);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout-all', { method: 'POST' }).catch(() => {});
    await session.clear();
    setUser(null);
    setBranding(null);
  }, []);

  const resolvedMode: ThemeMode = useMemo(() => {
    if (themePreference !== 'system') return themePreference;
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [themePreference, systemScheme]);

  const theme = useMemo(() => {
    const brandColor = branding?.branding?.primaryColor || null;
    return buildTheme(resolvedMode, brandColor);
  }, [resolvedMode, branding]);

  const value: AuthState = {
    ready,
    user,
    branding,
    theme,
    themePreference,
    setThemePreference,
    login,
    logout,
    refreshMe: loadMe,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
