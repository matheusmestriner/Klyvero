'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { applyBranding, DEFAULT_LOGO_URL, ResolvedBranding } from '../../lib/branding';

function readRecoveryToken() {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const value = url.searchParams.get('token') || '';

  // Keep the one-time credential out of browser history and future referrers
  // as soon as it has been captured by this page.
  if (value) {
    url.searchParams.delete('token');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  return value;
}

export default function ResetPasswordPage() {
  const [brand, setBrand] = useState<ResolvedBranding | null>(null);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setToken(readRecoveryToken());

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

    setError('');

    if (!token) {
      setError('O link de recuperação é inválido, expirou ou já foi utilizado.');
      return;
    }
    if (password.length < 12) {
      setError('A senha precisa ter pelo menos 12 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('As senhas não conferem.');
      return;
    }

    setBusy(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
      setToken('');
      setPassword('');
      setConfirmation('');
    } catch {
      setError('Não foi possível redefinir a senha. O link pode ter expirado ou já ter sido utilizado.');
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

        {done ? (
          <>
            <h1>Senha alterada</h1>
            <p className="muted">Sua senha foi redefinida com sucesso.</p>
            <p className="muted center">Por segurança, as sessões anteriores foram invalidadas.</p>
            <Link className="btn primary full" href="/login">Entrar novamente</Link>
          </>
        ) : (
          <>
            <h1>Crie uma nova senha</h1>
            <p className="muted">Use uma senha forte com pelo menos 12 caracteres. O link é de uso único.</p>

            <div className="field">
              <label>Nova senha</label>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                disabled={busy || !token}
              />
            </div>

            <div className="field">
              <label>Confirmar senha</label>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                disabled={busy || !token}
              />
            </div>

            {error && <div className="error" role="alert">{error}</div>}

            <button className="btn primary full" disabled={busy || !token}>
              {busy ? 'Salvando…' : 'Redefinir senha'}
            </button>

            {!token && !error && (
              <p className="muted center">Abra o link recebido por e-mail para continuar.</p>
            )}

            <p className="muted center">
              <Link href="/login">Voltar para o login</Link>
            </p>
          </>
        )}
      </form>
    </div>
  );
}
