'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { PageTitle } from '../../../components/resource-page';
import { SignupInvites } from './signup-invites';

const FEATURES = [
  'dashboard',
  'prospecting',
  'leads',
  'companies',
  'contacts',
  'crm',
  'campaigns',
  'email',
  'whatsapp',
  'ai_agents',
  'calendar',
  'analytics',
  'integrations',
  'users',
  'white_label',
  'billing',
];

type Tenant = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  parentTenantId?: string | null;
};

export default function TenantsPage() {
  const [rows, setRows] = useState<Tenant[]>([]);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [features, setFeatures] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showTenant, setShowTenant] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [message, setMessage] = useState('');

  const load = () =>
    api('/tenants')
      .then((data) => setRows(data))
      .catch((error) => setMessage(error.message));

  useEffect(() => {
    load();
  }, []);

  async function select(tenant: Tenant) {
    setSelected(tenant);
    setMessage('');
    const [featureRows, domainRows, userRows] = await Promise.all([
      api(`/tenants/${tenant.id}/features`),
      api(`/tenants/${tenant.id}/domains`),
      api(`/tenants/${tenant.id}/users`),
    ]);
    setFeatures(featureRows);
    setDomains(domainRows);
    setUsers(userRows);
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        slug: form.get('slug'),
        type: form.get('type'),
        parentTenantId: form.get('parentTenantId') || undefined,
      }),
    });
    setShowTenant(false);
    load();
  }

  async function toggleFeature(key: string, enabled: boolean) {
    if (!selected) return;
    await api(`/tenants/${selected.id}/features/${key}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    setFeatures(await api(`/tenants/${selected.id}/features`));
  }

  function featureEnabled(key: string) {
    const row = features.find((item) => item.key === key);
    return row ? row.enabled : true;
  }

  async function addDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const created = await api(`/tenants/${selected.id}/domains`, {
      method: 'POST',
      body: JSON.stringify({ hostname: form.get('hostname') }),
    });
    setMessage(
      `Crie o TXT ${created.dns.name} com o valor ${created.dns.value} e depois clique em verificar.`,
    );
    setDomains(await api(`/tenants/${selected.id}/domains`));
    event.currentTarget.reset();
  }

  async function verifyDomain(domainId: string) {
    if (!selected) return;
    try {
      await api(`/tenants/${selected.id}/domains/${domainId}/verify`, {
        method: 'POST',
      });
      setMessage('Domínio verificado com sucesso.');
    } catch (error: any) {
      setMessage(error.message);
    }
    setDomains(await api(`/tenants/${selected.id}/domains`));
  }

  async function setPrimary(domainId: string) {
    if (!selected) return;
    await api(`/tenants/${selected.id}/domains/${domainId}/primary`, {
      method: 'POST',
    });
    setDomains(await api(`/tenants/${selected.id}/domains`));
  }

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    await api(`/tenants/${selected.id}/users`, {
      method: 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
        role: form.get('role'),
      }),
    });
    setShowUser(false);
    setUsers(await api(`/tenants/${selected.id}/users`));
  }

  return (
    <>
      <PageTitle
        title="Organizações"
        subtitle="Plataforma → Revendas → Clientes, com isolamento, marca e recursos próprios."
        action={
          <button className="btn primary" onClick={() => setShowTenant(true)}>
            Nova organização
          </button>
        }
      />

      {message && <div className="notice">{message}</div>}

      <div className="grid-2">
        <div className="card">
          <h3>Hierarquia</h3>
          {rows.map((tenant) => (
            <button
              key={tenant.id}
              className={`tenant-row ${selected?.id === tenant.id ? 'selected' : ''}`}
              onClick={() => select(tenant)}
            >
              <div>
                <b>{tenant.name}</b>
                <span className="muted">{tenant.slug}</span>
              </div>
              <span className="pill">{tenant.type}</span>
            </button>
          ))}
        </div>

        <div className="card">
          <h3>Permissões por módulo</h3>
          {selected ? (
            <>
              <p className="muted">
                Políticas de {selected.name}. Um bloqueio do tenant pai também bloqueia descendentes.
              </p>
              <div className="feature-grid">
                {FEATURES.map((key) => (
                  <label className="feature-item" key={key}>
                    <span>{key}</span>
                    <input
                      type="checkbox"
                      checked={featureEnabled(key)}
                      onChange={(event) => toggleFeature(key, event.target.checked)}
                    />
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Selecione uma organização.</p>
          )}
        </div>
      </div>

      <SignupInvites />

      {selected && (
        <div className="grid-2 spaced">
          <section className="card">
            <h3>Domínios white-label</h3>
            <p className="muted">
              Validação por registro TXT antes de ativar um domínio customizado.
            </p>
            <form className="row" onSubmit={addDomain}>
              <input name="hostname" placeholder="app.empresa.com.br" required />
              <button className="btn primary">Adicionar</button>
            </form>
            <div className="stack spaced">
              {domains.map((domain) => (
                <div className="tenant-row selected" key={domain.id}>
                  <div>
                    <b>{domain.hostname}</b>
                    <span className="muted">
                      {domain.status} {domain.isPrimary ? '· principal' : ''}
                    </span>
                  </div>
                  <div className="row">
                    {domain.status !== 'VERIFIED' && (
                      <button className="btn ghost" onClick={() => verifyDomain(domain.id)}>
                        Verificar
                      </button>
                    )}
                    {domain.status === 'VERIFIED' && !domain.isPrimary && (
                      <button className="btn ghost" onClick={() => setPrimary(domain.id)}>
                        Tornar principal
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!domains.length && <span className="muted">Nenhum domínio cadastrado.</span>}
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <div>
                <h3>Usuários de {selected.name}</h3>
                <p className="muted">Equipe isolada dentro deste tenant.</p>
              </div>
              <button className="btn ghost" onClick={() => setShowUser(true)}>
                Novo usuário
              </button>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Papel</th>
                  <th>Ativo</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      {user.name}
                      <div className="muted">{user.email}</div>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.active ? 'Sim' : 'Não'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {showTenant && (
        <div className="modalback">
          <form className="modal" onSubmit={createTenant}>
            <div className="modalhead">
              <h3>Nova organização</h3>
              <button type="button" className="btn ghost" onClick={() => setShowTenant(false)}>
                Fechar
              </button>
            </div>
            <div className="field"><label>Nome</label><input name="name" required /></div>
            <div className="field"><label>Slug</label><input name="slug" required /></div>
            <div className="field">
              <label>Tipo</label>
              <select name="type"><option>RESELLER</option><option>CUSTOMER</option></select>
            </div>
            <div className="field">
              <label>Tenant pai</label>
              <select name="parentTenantId">
                <option value="">Meu tenant</option>
                {rows.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.type}</option>
                ))}
              </select>
            </div>
            <button className="btn primary spaced">Criar</button>
          </form>
        </div>
      )}

      {showUser && selected && (
        <div className="modalback">
          <form className="modal" onSubmit={addUser}>
            <div className="modalhead">
              <h3>Novo usuário · {selected.name}</h3>
              <button type="button" className="btn ghost" onClick={() => setShowUser(false)}>
                Fechar
              </button>
            </div>
            <div className="field"><label>Nome</label><input name="name" required /></div>
            <div className="field"><label>E-mail</label><input name="email" type="email" required /></div>
            <div className="field"><label>Senha inicial</label><input name="password" type="password" minLength={12} required /></div>
            <div className="field">
              <label>Papel</label>
              <select name="role">
                <option>ADMIN</option><option>MANAGER</option><option>SDR</option>
                <option>MEMBER</option><option>VIEWER</option>
              </select>
            </div>
            <button className="btn primary spaced">Criar usuário</button>
          </form>
        </div>
      )}
    </>
  );
}
