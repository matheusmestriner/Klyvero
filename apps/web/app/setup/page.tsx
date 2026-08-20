'use client';
import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';

export default function Setup() {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg('');
    const f = new FormData(e.currentTarget);
    const payload = Object.fromEntries(f);
    payload.tenantSlug = String(payload.tenantSlug ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    try {
      await api('/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) });
      setMsg('Plataforma inicializada com segurança. Agora faça login.');
      e.currentTarget.reset();
    } catch (error: any) {
      setMsg(error?.message || 'Falha ao inicializar. Verifique os dados e tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="logo"><i className="mark" />Klyvero</div>
        <h1>Inicializar plataforma</h1>
        <div className="notice">Esta etapa cria o primeiro administrador e só pode ser concluída uma vez.</div>
        {[
          ['bootstrapToken', 'Token de inicialização', 'password'],
          ['tenantName', 'Empresa', 'text'],
          ['tenantSlug', 'Slug do workspace', 'text'],
          ['name', 'Nome do administrador', 'text'],
          ['email', 'E-mail', 'email'],
          ['password', 'Senha (12+ caracteres)', 'password'],
        ].map(([key, label, type]) => (
          <div className="field" key={key}>
            <label>{label}</label>
            <input name={key} type={type} required autoCapitalize={key === 'tenantSlug' ? 'none' : undefined} />
          </div>
        ))}
        <button className="btn primary full" disabled={busy}>{busy ? 'Inicializando…' : 'Inicializar'}</button>
        {msg && <div className="notice">{msg}</div>}
      </form>
    </div>
  );
}
