'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, session } from '../lib/api';
import { applyBranding, isFeatureEnabled, ResolvedBranding } from '../lib/branding';
import { Icon, IconName } from './icon';

type User = { id: string; name: string; email: string; role: string; tenantId: string };
type NavItem = { label: string; href: string; icon: IconName; feature?: string; roles?: string[] };
type NavGroup = { label?: string; items: NavItem[] };
type Notification = { id: string; title: string; body?: string; type: string; readAt?: string; createdAt: string };

const AuthContext = createContext<{ user: User | null; brand: ResolvedBranding | null }>({ user: null, brand: null });
export const useAuth = () => useContext(AuthContext);

const ADMIN = ['OWNER', 'ADMIN'];
const navGroups: NavGroup[] = [
  {
    items: [{ label: 'Dashboard', href: '/app', icon: 'dashboard', feature: 'dashboard' }],
  },
  {
    label: 'Vendas',
    items: [
      { label: 'Prospecção', href: '/app/prospecting', icon: 'prospecting', feature: 'prospecting' },
      { label: 'Leads', href: '/app/leads', icon: 'leads', feature: 'leads' },
      { label: 'Empresas', href: '/app/companies', icon: 'companies', feature: 'companies' },
      { label: 'Contatos', href: '/app/contacts', icon: 'contacts', feature: 'contacts' },
      { label: 'CRM', href: '/app/crm', icon: 'crm', feature: 'crm' },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { label: 'Campanhas', href: '/app/campaigns', icon: 'campaigns', feature: 'campaigns' },
      { label: 'E-mail', href: '/app/email', icon: 'email', feature: 'email' },
      { label: 'WhatsApp', href: '/app/whatsapp', icon: 'whatsapp', feature: 'whatsapp' },
      { label: 'Inbox', href: '/app/inbox', icon: 'inbox', feature: 'whatsapp' },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { label: 'Agentes IA', href: '/app/ai', icon: 'ai', feature: 'ai_agents' },
      { label: 'Analytics', href: '/app/analytics', icon: 'analytics', feature: 'analytics' },
      { label: 'Agenda', href: '/app/calendar', icon: 'calendar', feature: 'calendar' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { label: 'Integrações', href: '/app/integrations', icon: 'integrations', feature: 'integrations', roles: ADMIN },
      { label: 'White-label', href: '/app/branding', icon: 'branding', feature: 'white_label', roles: ADMIN },
      { label: 'Organizações', href: '/app/tenants', icon: 'tenants', feature: 'users', roles: ADMIN },
      { label: 'Equipe', href: '/app/team', icon: 'team', feature: 'users', roles: ADMIN },
    ],
  },
  {
    label: 'Desenvolvedor',
    items: [
      { label: 'API Keys', href: '/app/api-keys', icon: 'api', feature: 'integrations', roles: ADMIN },
      { label: 'Webhooks', href: '/app/webhooks', icon: 'webhooks', feature: 'integrations', roles: ADMIN },
    ],
  },
  {
    label: 'Conta',
    items: [
      { label: 'Plano e cobrança', href: '/app/billing', icon: 'billing', feature: 'billing', roles: ADMIN },
      { label: 'Auditoria', href: '/app/audit', icon: 'audit', roles: ADMIN },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [brand, setBrand] = useState<ResolvedBranding | null>(null);
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    const savedCollapsed = window.localStorage.getItem('klyvero.sidebarCollapsed') === '1';
    setCollapsed(savedCollapsed);

    const savedTheme = window.localStorage.getItem('klyvero.theme');
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const resolvedTheme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : systemDark ? 'dark' : 'light';
    setTheme(resolvedTheme);

    api('/auth/refresh', { method: 'POST' })
      .then((data) => {
        session.set(data.accessToken);
        setUser(data.user);
        return Promise.all([api('/branding/me'), api('/notifications').catch(() => [])]);
      })
      .then(([resolved, noticeRows]: [ResolvedBranding, Notification[]]) => {
        setBrand(resolved);
        applyBranding(resolved);
        setNotifications(noticeRows);

        const brandTheme = resolved.branding?.themeMode;
        if (!savedTheme && (brandTheme === 'LIGHT' || brandTheme === 'DARK')) {
          const selected = brandTheme.toLowerCase() as 'light' | 'dark';
          setTheme(selected);
          document.documentElement.dataset.theme = selected;
        } else {
          document.documentElement.dataset.theme = resolvedTheme;
        }
      })
      .catch(() => router.replace('/login'))
      .finally(() => setReady(true));
  }, [router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setNotificationsOpen(false);
        setDrawerOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => setDrawerOpen(false), [path]);

  const visibleGroups = useMemo(() => {
    if (!user) return [];
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.roles && !item.roles.includes(user.role)) return false;
          return isFeatureEnabled(brand, item.feature);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [brand, user]);

  const visibleNav = useMemo(() => visibleGroups.flatMap((group) => group.items), [visibleGroups]);
  useEffect(() => {
    const current = visibleNav.find((item) => item.href === '/app' ? path === '/app' : path === item.href || path.startsWith(`${item.href}/`));
    const name = brand?.branding?.productName || brand?.tenant?.name || 'Klyvero';
    document.title = current ? `${current.label} | ${name}` : name;
  }, [brand, path, visibleNav]);

  const commandResults = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return visibleNav.slice(0, 10);
    return visibleNav.filter((item) => item.label.toLowerCase().includes(query));
  }, [commandQuery, visibleNav]);

  const unread = notifications.filter((notification) => !notification.readAt).length;

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem('klyvero.sidebarCollapsed', next ? '1' : '0');
      return next;
    });
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    window.localStorage.setItem('klyvero.theme', next);
    document.documentElement.dataset.theme = next;
  }

  async function markRead(notification: Notification) {
    if (notification.readAt) return;
    await api(`/notifications/${notification.id}/read`, { method: 'POST' }).catch(() => {});
    setNotifications((rows) => rows.map((row) => row.id === notification.id ? { ...row, readAt: new Date().toISOString() } : row));
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    session.clear();
    router.replace('/login');
  }

  if (!ready) return <AppLoading />;
  if (!user) return null;

  const branding = brand?.branding;
  const productName = branding?.productName || brand?.tenant?.name || 'Klyvero';
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';

  const sidebar = (
    <>
      <div className="side-brand-row">
        <Link href="/app" className="logo side-brand" aria-label={productName}>
          {branding?.compactLogoUrl || branding?.logoUrl ? (
            <img className="brand-logo compact" src={branding.compactLogoUrl || branding.logoUrl} alt={productName} />
          ) : <i className="mark" />}
          <span>{productName}</span>
        </Link>
        <button className="icon-btn side-collapse" onClick={toggleCollapsed} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} />
        </button>
      </div>

      <nav className="nav-groups" aria-label="Navegação principal">
        {visibleGroups.map((group, groupIndex) => (
          <div className="nav-group" key={group.label || `main-${groupIndex}`}>
            {group.label && <div className="nav-group-label">{group.label}</div>}
            <div className="nav-group-items">
              {group.items.map((item) => {
                const active = item.href === '/app' ? path === '/app' : path === item.href || path.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href} className={`nav-link ${active ? 'active' : ''}`} title={collapsed ? item.label : undefined}>
                    <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
                    <span className="nav-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="side-footer">
        <div className="workspace-card">
          <span className="workspace-dot" />
          <div>
            <strong>{brand?.tenant?.name || productName}</strong>
            <span>{brand?.tenant?.type || 'WORKSPACE'}</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <AuthContext.Provider value={{ user, brand }}>
      <div className={`app ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className="side desktop-side">{sidebar}</aside>

        {drawerOpen && <button className="mobile-backdrop" aria-label="Fechar menu" onClick={() => setDrawerOpen(false)} />}
        <aside className={`mobile-drawer ${drawerOpen ? 'open' : ''}`}>
          <div className="mobile-drawer-head">
            <span>Menu</span>
            <button className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Fechar menu"><Icon name="x" /></button>
          </div>
          {sidebar}
        </aside>

        <main className="content">
          <header className="topbar">
            <div className="topbar-left">
              <button className="icon-btn mobile-menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
              <button className="command-trigger" onClick={() => setCommandOpen(true)}>
                <Icon name="search" size={17} />
                <span>Buscar em {productName}</span>
                <kbd>⌘ K</kbd>
              </button>
            </div>

            <div className="topbar-actions">
              <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              </button>

              <div className="popover-wrap">
                <button className="icon-btn notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Notificações">
                  <Icon name="bell" />
                  {unread > 0 && <span className="notification-badge">{unread > 9 ? '9+' : unread}</span>}
                </button>
                {notificationsOpen && (
                  <div className="popover notifications-popover">
                    <div className="popover-head">
                      <div><strong>Notificações</strong><span>{unread} não lida{unread === 1 ? '' : 's'}</span></div>
                    </div>
                    <div className="notification-list">
                      {notifications.length ? notifications.slice(0, 8).map((notification) => (
                        <button key={notification.id} className={`notification-row ${notification.readAt ? '' : 'unread'}`} onClick={() => markRead(notification)}>
                          <span className={`notification-type ${notification.type.toLowerCase()}`} />
                          <div>
                            <strong>{notification.title}</strong>
                            {notification.body && <span>{notification.body}</span>}
                            <small>{formatRelative(notification.createdAt)}</small>
                          </div>
                        </button>
                      )) : <div className="empty-state compact"><Icon name="bell" size={28}/><strong>Tudo em dia</strong><span>Novas notificações aparecerão aqui.</span></div>}
                    </div>
                  </div>
                )}
              </div>

              <div className="profile-chip">
                <span className="avatar">{initials}</span>
                <div className="profile-copy">
                  <strong>{user.name}</strong>
                  <span>{roleLabel(user.role)}</span>
                </div>
                <button className="profile-logout" onClick={logout}>Sair</button>
              </div>
            </div>
          </header>
          <div className="page-content">{children}</div>
          <footer className="app-footer">
            <span>© {new Date().getFullYear()} {productName}. Todos os direitos reservados.</span>
            <div className="app-footer-links">
              {branding?.supportEmail && <a href={`mailto:${branding.supportEmail}`}>Suporte</a>}
              {branding?.privacyUrl && <a href={branding.privacyUrl} target="_blank" rel="noreferrer">Privacidade</a>}
              {branding?.termsUrl && <a href={branding.termsUrl} target="_blank" rel="noreferrer">Termos</a>}
            </div>
          </footer>
        </main>
      </div>

      {commandOpen && (
        <div className="modalback command-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCommandOpen(false)}>
          <div className="command-palette">
            <div className="command-search">
              <Icon name="search" />
              <input autoFocus placeholder="Digite para navegar..." value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} />
              <kbd>ESC</kbd>
            </div>
            <div className="command-results">
              {commandResults.length ? commandResults.map((item) => (
                <button key={item.href} onClick={() => { router.push(item.href); setCommandOpen(false); setCommandQuery(''); }}>
                  <span className="command-result-icon"><Icon name={item.icon} /></span>
                  <span>{item.label}</span>
                  <Icon name="arrow-up-right" size={15} />
                </button>
              )) : <div className="empty-state compact"><strong>Nenhum resultado</strong><span>Tente outro termo.</span></div>}
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

function AppLoading() {
  return (
    <div className="app-loading">
      <div className="loading-brand"><i className="mark" /><strong>Klyvero</strong></div>
      <div className="loading-line"><span /></div>
    </div>
  );
}

function roleLabel(role: string) {
  const labels: Record<string, string> = { OWNER: 'Proprietário', ADMIN: 'Administrador', MANAGER: 'Gestor', SDR: 'SDR', MEMBER: 'Membro', VIEWER: 'Visualizador' };
  return labels[role] || role;
}

function formatRelative(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}
