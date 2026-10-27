'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import styles from './signup-invites.module.css';

type Invite = {
  id: string;
  label: string;
  email: string | null;
  status: 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  tenant: { name: string; slug: string } | null;
};

const STATUS_LABEL: Record<Invite['status'], string> = {
  PENDING: 'Aguardando',
  USED: 'Utilizado',
  EXPIRED: 'Expirado',
  REVOKED: 'Revogado',
};

const date = (value: string) => new Date(value).toLocaleDateString('pt-BR');

/**
 * White-label sign-up links. Only the platform's own owner/admin sees this: every other workspace
 * (resellers, customers, plain members) renders nothing.
 */
export function SignupInvites() {
  const [allowed, setAllowed] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ label: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => api('/signup-invites').then(setInvites).catch((e) => setError(e.message)), []);

  useEffect(() => {
    api('/auth/me')
      .then((me) => {
        const platformAdmin = me?.tenant?.type === 'PLATFORM' && (me?.role === 'OWNER' || me?.role === 'ADMIN');
        setAllowed(platformAdmin);
        if (platformAdmin) load();
      })
      .catch(() => setAllowed(false));
  }, [load]);

  if (!allowed) return null;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const out = await api('/signup-invites', {
        method: 'POST',
        body: JSON.stringify({
          label: String(data.get('label') ?? '').trim(),
          email: String(data.get('email') ?? '').trim().toLowerCase() || undefined,
          validityDays: Number(data.get('validityDays') ?? 7),
        }),
      });
      setCreated({ label: out.label, url: out.url });
      setCopied(false);
      form.reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar o convite');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.');
    }
  }

  async function revoke(invite: Invite) {
    if (!window.confirm(`Revogar o convite de ${invite.label}? O link deixa de funcionar.`)) return;
    try {
      await api(`/signup-invites/${invite.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível revogar');
    }
  }

  return (
    <section className="card spaced" aria-labelledby="signup-invites-title">
      <h3 id="signup-invites-title">Convites de cadastro (white label)</h3>
      <p className="muted">
        Gere um link de uso único para o dono de cada empresa. Ao se cadastrar, ele recebe uma conta de revenda no seu
        nome, com marca própria. Um cadastro por e-mail e por CPF/CNPJ.
      </p>

      <form className={styles.form} onSubmit={create}>
        <input name="label" aria-label="Para quem é o convite" placeholder="Para quem é (ex.: Acme Marketing)" required minLength={2} maxLength={120} disabled={busy} />
        <input name="email" type="email" aria-label="E-mail do dono (opcional)" placeholder="E-mail do dono (opcional)" disabled={busy} />
        <select name="validityDays" defaultValue="7" disabled={busy} aria-label="Validade do link">
          <option value="3">Vale 3 dias</option>
          <option value="7">Vale 7 dias</option>
          <option value="15">Vale 15 dias</option>
          <option value="30">Vale 30 dias</option>
        </select>
        <button className="btn primary" disabled={busy}>{busy ? 'Gerando…' : 'Gerar link'}</button>
      </form>

      {error && <div className="notice" role="alert">{error}</div>}

      {created && (
        <div className="notice" role="status">
          <b>Link para {created.label}</b>
          <div className={styles.link}>
            <input readOnly value={created.url} onFocus={(event) => event.currentTarget.select()} aria-label="Link de cadastro" />
            <button type="button" className="btn ghost" onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>
          </div>
          <span className="muted">Guarde agora: por segurança, este link não poderá ser exibido de novo.</span>
        </div>
      )}

      <table className="table spaced">
        <thead>
          <tr>
            <th>Convite</th>
            <th>Situação</th>
            <th>Validade</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invites.map((invite) => (
            <tr key={invite.id}>
              <td>
                {invite.label}
                <div className="muted">{invite.tenant ? `Workspace ${invite.tenant.slug}` : invite.email ?? 'Qualquer e-mail'}</div>
              </td>
              <td>{STATUS_LABEL[invite.status]}</td>
              <td>{invite.status === 'USED' && invite.usedAt ? `Usado em ${date(invite.usedAt)}` : `Até ${date(invite.expiresAt)}`}</td>
              <td>
                {invite.status === 'PENDING' && (
                  <button className="btn ghost" onClick={() => revoke(invite)}>Revogar</button>
                )}
              </td>
            </tr>
          ))}
          {!invites.length && (
            <tr>
              <td colSpan={4} className="muted">Nenhum convite gerado ainda.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
