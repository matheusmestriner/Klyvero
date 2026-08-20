'use client';
import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { DEFAULT_LOGO_URL } from '../../lib/branding';

export default function Setup() {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const formElement = e.currentTarget;
    setBusy(true);
    setMsg('');
    const f = new FormData(formElement);
    const payload = Object.fromEntries(f);
    payload.tenantSlug = String(payload.tenantSlug ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const slug = String(payload.tenantSlug ?? '');
    const email = String(payload.email ?? '').trim();
    const password = String(payload.password ?? '');
    if (slug.length < 2 || !email.includes('@') || password.length < 12) {
      setMsg('Verifique o slug, use um e-mail válido e uma senha com pelo menos 12 caracteres.');
      setBusy(false);
      return;
    }

    try {
      await api('/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) });
      setMsg('Plataforma inicializada com segurança. Agora faça login.');
      formElement.reset();
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.includes('invalid_bootstrap_payload')) setMsg('Dados inválidos. Verifique slug, e-mail e senha de 12+ caracteres.');
      else if (message.includes('platform_already_initialized')) setMsg('A plataforma já foi inicializada. Acesse a tela de login.');
      else setMsg(message || 'Falha ao inicializar. Verifique os dados e tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="logo"><img className="brand-logo" src={DEFAULT_LOGO_URL} alt="Klyvero" /></div>
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
            <input
              name={key}
              type={type}
              required
              minLength={key === 'password' ? 12 : key === 'tenantSlug' ? 2 : undefined}
              autoCapitalize={key === 'tenantSlug' ? 'none' : undefined}
            />
          </div>
        ))}
        <button className="btn primary full" disabled={busy}>{busy ? 'Inicializando…' : 'Inicializar'}</button>
        {msg && <div className="notice">{msg}</div>}
      </form>
    </div>
  );
}
