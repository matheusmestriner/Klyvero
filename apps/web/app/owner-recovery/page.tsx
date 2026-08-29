'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { applyBranding, DEFAULT_LOGO_URL, ResolvedBranding } from '../../lib/branding';

const GENERIC_ERROR = 'Não foi possível concluir a recuperação. Verifique os dados e tente novamente.';

export default function OwnerRecoveryPage() {
  const [brand, setBrand] = useState<ResolvedBranding | null>(null);
  const [workspace, setWorkspace] = useState('');
  const [email, setEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
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

    setError('');
    if (password.length < 12) {
      setError('A nova senha precisa ter pelo menos 12 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('As senhas não conferem.');
      return;
    }
    if (!recoveryCode.trim()) {
      setError('Informe a chave de recuperação administrativa.');
      return;
    }

    setBusy(true);
    try {
      await api('/auth/owner-recovery', {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: workspace.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
          recoveryCode: recoveryCode.trim(),
          password,
        }),
      });
      setDone(true);
      setRecoveryCode('');
      setPassword('');
      setConfirmation('');
    } catch {
      setError(GENERIC_ERROR);
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
            <h1>Acesso recuperado</h1>
            <p className="muted">A senha do OWNER foi redefinida e a chave administrativa não deve ser reutilizada.</p>
            <p className="muted center">Por segurança, invalide a chave de recuperação no provedor de segredos e gere uma nova antes de reutilizar este fluxo.</p>
            <Link className="btn primary full" href="/login">Voltar para o login</Link>
          </>
        ) : (
          <>
            <h1>Recuperação administrativa</h1>
            <p className="muted">Use este fluxo somente quando o OWNER não tiver acesso ao e-mail ou ao fluxo normal de recuperação.</p>

            <div className="error" role="note">
              A chave de recuperação nunca é armazenada no código-fonte, banco de dados ou interface. Ela deve ser provisionada como segredo do ambiente e protegida fora da aplicação.
            </div>

            <div className="field">
              <label htmlFor="workspace">Workspace</label>
              <input id="workspace" value={workspace} onChange={(event) => setWorkspace(event.target.value)} autoComplete="organization" required disabled={busy} />
            </div>

            <div className="field">
              <label htmlFor="email">E-mail do OWNER</label>
              <input id="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required disabled={busy} />
            </div>

            <div className="field">
              <label htmlFor="recoveryCode">Chave de recuperação</label>
              <input id="recoveryCode" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} type="password" autoComplete="off" required disabled={busy} />
            </div>

            <div className="field">
              <label htmlFor="password">Nova senha</label>
              <input id="password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={12} required disabled={busy} />
            </div>

            <div className="field">
              <label htmlFor="confirmation">Confirmar nova senha</label>
              <input id="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} type="password" autoComplete="new-password" minLength={12} required disabled={busy} />
            </div>

            {error && <div className="error" role="alert">{error}</div>}

            <button className="btn primary full" disabled={busy}>
              {busy ? 'Recuperando…' : 'Recuperar acesso do OWNER'}
            </button>

            <p className="muted center"><Link href="/forgot-password">Usar recuperação por e-mail</Link></p>
            <p className="muted center"><Link href="/login">Voltar para o login</Link></p>
          </>
        )}
      </form>
    </div>
  );
}
