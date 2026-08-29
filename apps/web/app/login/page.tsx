'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, session } from '../../lib/api';
import { applyBranding, DEFAULT_LOGO_URL, ResolvedBranding } from '../../lib/branding';

type BootstrapStatus = {
  initialized?: boolean;
  available?: boolean;
};

function safeLoginError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('workspace') || message.includes('tenant')) {
    return 'Workspace não encontrado. Confira o slug do workspace.';
  }

  if (message.includes('invalid') || message.includes('credentials') || message.includes('password') || message.includes('unauthorized')) {
    return 'E-mail ou senha inválidos. Confira seus dados e tente novamente.';
  }

  return 'Não foi possível entrar. Confira workspace, e-mail e senha.';
}

export default function Login() {
  const [error, setError] = useState('');
  const [brand, setBrand] = useState<ResolvedBranding | null>(null);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const hostname = window.location.hostname;
    const reason = new URLSearchParams(window.location.search).get('reason');
    if (reason === 'session-expired') {
      setError('Sua sessão expirou. Entre novamente para continuar.');
    }

    api(`/branding/resolve/domain/${encodeURIComponent(hostname)}`)
      .then((resolved: ResolvedBranding) => {
        applyBranding(resolved);
        setBrand(resolved);
      })
      .catch(() => {
        const fallback: ResolvedBranding = {
          branding: {
            productName: 'Klyvero',
            themeMode: 'SYSTEM',
            logoUrl: DEFAULT_LOGO_URL,
          },
        };
        applyBranding(fallback);
        setBrand(fallback);
      });

    api('/auth/bootstrap/status')
      .then((status: BootstrapStatus) => {
        setBootstrapAvailable(Boolean(status?.available) && !status?.initialized);
      })
      .catch(() => setBootstrapAvailable(false));

    api('/auth/refresh', { method: 'POST' })
      .then((data) => {
        if (!data?.accessToken) return;
        session.set(data.accessToken);
        router.replace('/app');
      })
      .catch(() => {});
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError('');

    const form = new FormData(event.currentTarget);
    const tenantSlug = String(form.get('tenantSlug') || '').trim().toLowerCase();

    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug,
          email: String(form.get('email') || '').trim().toLowerCase(),
          password: form.get('password'),
        }),
      });

      if (!data?.accessToken) throw new Error('missing_access_token');
      session.set(data.accessToken);
      router.replace('/app');
    } catch (loginError) {
      setError(safeLoginError(loginError));
      setBusy(false);
    }
  }

  const branding = brand?.branding;
  const productName = branding?.productName || brand?.tenant?.name || 'Klyvero';
  const title = branding?.loginTitle || 'Acesse seu workspace';
  const subtitle = branding?.loginSubtitle || 'Prospecção, cadências, CRM, WhatsApp e IA no mesmo lugar.';
  const logoUrl = branding?.logoUrl || DEFAULT_LOGO_URL;
  const resolvedTenantSlug = brand?.tenant?.slug || '';

  const loginStyle = useMemo(
    () =>
      branding?.loginBackgroundUrl
        ? {
            backgroundImage: `linear-gradient(135deg, color-mix(in srgb, var(--bg) 78%, transparent), color-mix(in srgb, var(--bg) 88%, transparent)), url("${branding.loginBackgroundUrl.replace(/["\\]/g, '')}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : undefined,
    [branding?.loginBackgroundUrl],
  );

  return (
    <div className="login" style={loginStyle}>
      <form className="login-card" onSubmit={submit}>
        <div className="logo">
          <img className="brand-logo" src={logoUrl} alt={productName} />
        </div>

        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>

        <div className="field">
          <label htmlFor="tenantSlug">Workspace</label>
          <input
            id="tenantSlug"
            name="tenantSlug"
            placeholder="sua-empresa"
            defaultValue={resolvedTenantSlug}
            autoCapitalize="none"
            autoComplete="organization"
            spellCheck={false}
            required
            disabled={busy}
          />
        </div>

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required disabled={busy} />
        </div>

        <div className="field">
          <label htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required disabled={busy} />
        </div>

        <div className="login-forgot">
          <a href="/forgot-password">Esqueci minha senha</a>
        </div>

        {error && <div className="error" role="alert">{error}</div>}

        <button className="btn primary full" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>

        {bootstrapAvailable && (
          <p className="muted center">
            <a href="/setup">Primeira configuração da plataforma</a>
          </p>
        )}

        {(branding?.privacyUrl || branding?.termsUrl || branding?.supportUrl) && (
          <div className="login-links muted center">
            {branding.privacyUrl && <a href={branding.privacyUrl} target="_blank" rel="noreferrer">Privacidade</a>}
            {branding.termsUrl && <a href={branding.termsUrl} target="_blank" rel="noreferrer">Termos</a>}
            {branding.supportUrl && <a href={branding.supportUrl} target="_blank" rel="noreferrer">Suporte</a>}
          </div>
        )}

        <div className="login-legal">
          <span>© {new Date().getFullYear()} {productName}</span>
          {branding?.supportEmail && <a href={`mailto:${branding.supportEmail}`}>{branding.supportEmail}</a>}
        </div>
      </form>
    </div>
  );
}
