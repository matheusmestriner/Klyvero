'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { applyBranding, DEFAULT_LOGO_URL, ResolvedBranding } from '../../lib/branding';

export default function ForgotPasswordPage() {
  const [brand, setBrand] = useState<ResolvedBranding | null>(null);
  const [email, setEmail] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const hostname = window.location.hostname;
    api(`/branding/resolve/domain/${encodeURIComponent(hostname)}`)
      .then((resolved: ResolvedBranding) => {
        applyBranding(resolved);
        setBrand(resolved);
      })
      .catch(() => {
        const fallback: ResolvedBranding = {
          branding: { productName: 'Klyvero', themeMode: 'SYSTEM', logoUrl: DEFAULT_LOGO_URL },
        };
        applyBranding(fallback);
        setBrand(fallback);
      });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: brand?.tenant?.slug || workspace.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
        }),
      });
      setSent(true);
    } catch {
      setError('Não foi possível processar a solicitação. Confira os dados e tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  const branding = brand?.branding;
  const productName = branding?.productName || brand?.tenant?.name || 'Klyvero';
  const logoUrl = branding?.logoUrl || DEFAULT_LOGO_URL;

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">
          <img className="brand-logo" src={logoUrl} alt={productName} />
        </div>

        {sent ? (
          <>
            <h1>Verifique seu e-mail</h1>
            <p className="muted">
              Se existir uma conta para esse endereço, enviamos um link para criar uma nova senha.
            </p>
            <p className="muted center">
              O link é temporário e pode ser usado uma única vez.
            </p>
            <Link className="btn primary full" href="/login">Voltar para o login</Link>
          </>
        ) : (
          <>
            <h1>Recuperar senha</h1>
            <p className="muted">Informe seu workspace e e-mail para receber um link seguro.</p>

            {!brand?.tenant?.slug && (
              <div className="field">
                <label>Workspace</label>
                <input
                  value={workspace}
                  onChange={(event) => setWorkspace(event.target.value)}
                  placeholder="sua-empresa"
                  autoCapitalize="none"
                  autoComplete="organization"
                  required
                  disabled={busy}
                />
              </div>
            )}

            <div className="field">
              <label>E-mail</label>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                required
                disabled={busy}
              />
            </div>

            {error && <div className="error" role="alert">{error}</div>}

            <button className="btn primary full" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar link de recuperação'}
            </button>

            <p className="muted center">
              <Link href="/login">Voltar para o login</Link>
            </p>
          </>
        )}
      </form>
    </div>
  );
}
