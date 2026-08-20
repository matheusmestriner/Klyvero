'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { DEFAULT_LOGO_URL } from '../../lib/branding';

type BootstrapStatus = {
  initialized?: boolean;
  available?: boolean;
  storage?: string;
};

export default function Setup() {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;

    api('/auth/bootstrap/status')
      .then((status: BootstrapStatus) => {
        if (!active) return;

        if (status?.initialized) {
          router.replace('/login');
          return;
        }

        setAvailable(Boolean(status?.available));
        if (!status?.available) {
          setMsg('A configuração inicial está temporariamente indisponível. Tente novamente em alguns instantes.');
        }
      })
      .catch(() => {
        if (!active) return;
        setAvailable(false);
        setMsg('Não foi possível validar o estado da plataforma. A inicialização foi bloqueada por segurança.');
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !available) return;

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
      await api('/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      formElement.reset();
      router.replace('/login');
    } catch (error: any) {
      const message = String(error?.message || '');

      if (message.includes('platform_already_initialized')) {
        router.replace('/login');
        return;
      }

      if (message.includes('bootstrap_storage_unavailable')) {
        setAvailable(false);
        setMsg('A inicialização foi bloqueada porque o armazenamento compartilhado está indisponível. Nenhuma nova configuração foi criada.');
      } else if (message.includes('invalid_bootstrap_payload')) {
        setMsg('Dados inválidos. Verifique slug, e-mail e senha de 12+ caracteres.');
      } else if (message.includes('invalid_bootstrap_token')) {
        setMsg('Token de inicialização inválido.');
      } else {
        setMsg(message || 'Falha ao inicializar. Verifique os dados e tente novamente.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="login">
        <div className="login-card">
          <div className="logo">
            <img className="brand-logo" src={DEFAULT_LOGO_URL} alt="Klyvero" />
          </div>
          <h1>Verificando plataforma</h1>
          <p className="muted">Validando se a configuração inicial ainda está disponível.</p>
        </div>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="login">
        <div className="login-card">
          <div className="logo">
            <img className="brand-logo" src={DEFAULT_LOGO_URL} alt="Klyvero" />
          </div>
          <h1>Configuração indisponível</h1>
          <div className="notice">{msg}</div>
          <a className="btn primary full center" href="/login">Ir para o login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">
          <img className="brand-logo" src={DEFAULT_LOGO_URL} alt="Klyvero" />
        </div>

        <h1>Inicializar plataforma</h1>
        <div className="notice">
          Esta etapa cria o primeiro administrador. Depois de concluída, esta tela é bloqueada permanentemente.
        </div>

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
              autoComplete={key === 'email' ? 'email' : key === 'password' ? 'new-password' : 'off'}
            />
          </div>
        ))}

        <button className="btn primary full" disabled={busy}>
          {busy ? 'Inicializando…' : 'Inicializar uma única vez'}
        </button>

        {msg && <div className="notice">{msg}</div>}
      </form>
    </div>
  );
}
