'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, session } from '../../lib/api';
import { applyBranding, DEFAULT_LOGO_URL, ResolvedBranding } from '../../lib/branding';

type BootstrapStatus = {
  initialized?: boolean;
  available?: boolean;
};

export default function Login() {
  const [error, setError] = useState('');
  const [brand, setBrand] = useState<ResolvedBranding | null>(null);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const hostname = window.location.hostname;

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
        session.set(data.accessToken);
        router.replace('/app');
      })
      .catch(() => {});
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const form = new FormData(event.currentTarget);

    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: brand?.tenant?.slug || form.get('tenantSlug'),
          email: form.get('email'),
          password: form.get('password'),
        }),
      });

      session.set(data.accessToken);
      router.replace('/app');
    } catch {
      setError('Não foi possível entrar. Verifique workspace, e-mail e senha.');
    }
  }

  const branding = brand?.branding;
  const productName = branding?.productName || brand?.tenant?.name || 'Klyvero';
  const title = branding?.loginTitle || 'Acesse seu workspace';
  const subtitle = branding?.loginSubtitle || 'Prospecção, cadências, CRM, WhatsApp e IA no mesmo lugar.';
  const logoUrl = branding?.logoUrl || DEFAULT_LOGO_URL;

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

        {!brand?.tenant?.slug && (
          <div className="field">
            <label>Workspace</label>
            <input name="tenantSlug" placeholder="sua-empresa" required />
          </div>
        )}

        <div className="field">
          <label>E-mail</label>
          <input name="email" type="email" autoComplete="email" required />
        </div>

        <div className="field">
          <label>Senha</label>
          <input name="password" type="password" autoComplete="current-password" required />
        </div>

        {error && <div className="error">{error}</div>}

        <button className="btn primary full">Entrar</button>

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
