'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../components/app-shell';
import { PageTitle } from '../../../components/resource-page';
import { Icon } from '../../../components/icon';

type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  active: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
};

type RoleKey = 'OWNER' | 'ADMIN' | 'MANAGER' | 'SDR' | 'MEMBER' | 'VIEWER';

type RoleDefinition = {
  label: string;
  summary: string;
  permissions: string[];
  tone: string;
};

const ROLE_DEFINITIONS: Record<RoleKey, RoleDefinition> = {
  OWNER: {
    label: 'Proprietário',
    summary: 'Controle total do workspace e das decisões administrativas.',
    permissions: ['Administração total', 'Equipe e papéis', 'Integrações', 'Dados comerciais', 'Configurações sensíveis'],
    tone: 'violet',
  },
  ADMIN: {
    label: 'Administrador',
    summary: 'Administra operação, usuários e configurações sem assumir a propriedade.',
    permissions: ['Equipe', 'Integrações', 'CRM', 'Campanhas', 'Analytics'],
    tone: 'blue',
  },
  MANAGER: {
    label: 'Gestor',
    summary: 'Coordena a operação comercial e acompanha resultados da equipe.',
    permissions: ['CRM', 'Leads', 'Campanhas', 'Analytics', 'Agenda'],
    tone: 'cyan',
  },
  SDR: {
    label: 'SDR',
    summary: 'Executa prospecção, cadências e qualificação de leads.',
    permissions: ['Prospecção', 'Leads', 'Contatos', 'Campanhas', 'Inbox'],
    tone: 'green',
  },
  MEMBER: {
    label: 'Membro',
    summary: 'Acesso operacional padrão aos recursos liberados no workspace.',
    permissions: ['CRM', 'Contatos', 'Tarefas', 'Inbox'],
    tone: 'amber',
  },
  VIEWER: {
    label: 'Visualizador',
    summary: 'Consulta informações sem permissão para administrar o workspace.',
    permissions: ['Consulta de dados', 'Dashboard', 'Analytics permitido'],
    tone: 'slate',
  },
};

const ROLE_ORDER: RoleKey[] = ['OWNER', 'ADMIN', 'MANAGER', 'SDR', 'MEMBER', 'VIEWER'];

export default function TeamPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<TeamUser[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | RoleKey>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'notice' | 'error'>('notice');
  const [generatedPassword, setGeneratedPassword] = useState('');

  const isOwner = user?.role === 'OWNER';

  async function load() {
    if (!user) return;
    setLoading(true);
    setMessage('');
    try {
      const data = await api(`/tenants/${user.tenantId}/users`);
      setRows(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setRows([]);
      setMessageType('error');
      setMessage(error?.message || 'Não foi possível carregar a equipe.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !normalized || row.name.toLowerCase().includes(normalized) || row.email.toLowerCase().includes(normalized);
      const matchesRole = roleFilter === 'ALL' || row.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? row.active : !row.active);
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [query, roleFilter, rows, statusFilter]);

  const stats = useMemo(() => {
    const active = rows.filter((row) => row.active).length;
    const admins = rows.filter((row) => row.role === 'OWNER' || row.role === 'ADMIN').length;
    const loggedRecently = rows.filter((row) => {
      if (!row.lastLoginAt) return false;
      return Date.now() - new Date(row.lastLoginAt).getTime() <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    return { total: rows.length, active, admins, loggedRecently };
  }, [rows]);

  function openCreate() {
    setGeneratedPassword('');
    setMessage('');
    setShowCreate(true);
  }

  function createStrongPassword() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%&*+-_=';
    const all = `${upper}${lower}${digits}${symbols}`;
    const pick = (source: string) => source[secureRandomIndex(source.length)];
    const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
    while (chars.length < 18) chars.push(pick(all));
    for (let index = chars.length - 1; index > 0; index -= 1) {
      const other = secureRandomIndex(index + 1);
      [chars[index], chars[other]] = [chars[other], chars[index]];
    }
    setGeneratedPassword(chars.join(''));
  }

  async function copyPassword() {
    if (!generatedPassword) return;
    await navigator.clipboard.writeText(generatedPassword);
    setMessageType('notice');
    setMessage('Senha inicial copiada. Envie-a por um canal seguro e solicite a troca no primeiro acesso.');
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || submitting) return;

    const form = new FormData(event.currentTarget);
    const role = String(form.get('role') || 'MEMBER') as RoleKey;
    const password = String(form.get('password') || '');

    if (role === 'OWNER' && !isOwner) {
      setMessageType('error');
      setMessage('Somente o proprietário pode criar outro proprietário.');
      return;
    }

    if (password.length < 12) {
      setMessageType('error');
      setMessage('A senha inicial precisa ter pelo menos 12 caracteres.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    try {
      await api(`/tenants/${user.tenantId}/users`, {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') || '').trim(),
          email: String(form.get('email') || '').trim().toLowerCase(),
          password,
          role,
        }),
      });
      setShowCreate(false);
      setGeneratedPassword('');
      setMessageType('notice');
      setMessage('Usuário criado com sucesso.');
      await load();
    } catch (error: any) {
      setMessageType('error');
      setMessage(error?.message || 'Não foi possível criar o usuário.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageTitle
        title="Equipe e permissões"
        subtitle="Gerencie pessoas, papéis e o nível de acesso ao workspace."
        action={
          <button className="btn primary" onClick={openCreate}>
            <Icon name="plus" size={16} /> Novo usuário
          </button>
        }
      />

      {message && <div className={messageType === 'error' ? 'error' : 'notice'}>{message}</div>}

      <div className="team-metrics">
        <Metric label="Usuários" value={stats.total} detail="cadastrados" icon="team" />
        <Metric label="Ativos" value={stats.active} detail={`${Math.max(stats.total - stats.active, 0)} inativo(s)`} icon="users" />
        <Metric label="Administradores" value={stats.admins} detail="OWNER + ADMIN" icon="shield" />
        <Metric label="Ativos em 7 dias" value={stats.loggedRecently} detail="com login recente" icon="activity" />
      </div>

      <section className="card spaced-lg team-directory-card">
        <div className="team-toolbar">
          <div>
            <span className="eyebrow">Diretório</span>
            <h3>Pessoas do workspace</h3>
            <p className="muted">Busque por nome ou e-mail e filtre por papel ou status.</p>
          </div>
          <button className="btn ghost" onClick={load} disabled={loading}>
            <Icon name="refresh" size={15} /> {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>

        <div className="team-filters">
          <div className="team-search">
            <Icon name="search" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuário..." />
          </div>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'ALL' | RoleKey)} aria-label="Filtrar por papel">
            <option value="ALL">Todos os papéis</option>
            {ROLE_ORDER.map((role) => <option value={role} key={role}>{ROLE_DEFINITIONS[role].label}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')} aria-label="Filtrar por status">
            <option value="ALL">Todos os status</option>
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
          </select>
        </div>

        {loading ? (
          <div className="team-loading"><span className="auth-runtime-spinner" /><span>Carregando equipe…</span></div>
        ) : filteredRows.length ? (
          <div className="team-table-wrap">
            <table className="table team-table">
              <thead><tr><th>Usuário</th><th>Papel</th><th>Status</th><th>Último login</th><th>Criado em</th></tr></thead>
              <tbody>
                {filteredRows.map((row) => {
                  const definition = ROLE_DEFINITIONS[row.role] || ROLE_DEFINITIONS.MEMBER;
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="team-user-cell">
                          <span className="team-avatar">{initials(row.name)}</span>
                          <div><strong>{row.name}</strong><span>{row.email}</span></div>
                        </div>
                      </td>
                      <td><span className={`role-badge ${definition.tone}`}>{definition.label}</span></td>
                      <td><span className={`status-pill ${row.active ? 'status-active' : 'status-inactive'}`}>{row.active ? 'Ativo' : 'Inativo'}</span></td>
                      <td>{formatDateTime(row.lastLoginAt)}</td>
                      <td>{formatDate(row.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact">
            <Icon name="team" size={28} />
            <strong>Nenhum usuário encontrado</strong>
            <span>Ajuste os filtros ou adicione uma nova pessoa ao workspace.</span>
          </div>
        )}
      </section>

      <section className="card spaced-lg">
        <div className="team-toolbar">
          <div>
            <span className="eyebrow">RBAC</span>
            <h3>Papéis do Klyvero</h3>
            <p className="muted">Os papéis determinam a faixa de acesso. Permissões granulares por ação serão aplicadas sobre esta base.</p>
          </div>
        </div>
        <div className="role-grid">
          {ROLE_ORDER.map((role) => {
            const definition = ROLE_DEFINITIONS[role];
            return (
              <article className="role-card" key={role}>
                <div className="role-card-head">
                  <span className={`role-badge ${definition.tone}`}>{definition.label}</span>
                  <code>{role}</code>
                </div>
                <p>{definition.summary}</p>
                <div className="role-permissions">
                  {definition.permissions.map((permission) => <span key={permission}><Icon name="check" size={13} /> {permission}</span>)}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {showCreate && (
        <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && !submitting && setShowCreate(false)}>
          <form className="modal team-user-modal" onSubmit={createUser}>
            <div className="modalhead">
              <div><span className="eyebrow">Equipe</span><h3>Novo usuário</h3></div>
              <button type="button" className="btn ghost" disabled={submitting} onClick={() => setShowCreate(false)}>Fechar</button>
            </div>

            <div className="field"><label>Nome</label><input name="name" minLength={2} maxLength={120} autoComplete="name" required /></div>
            <div className="field"><label>E-mail</label><input name="email" type="email" maxLength={254} autoComplete="email" required /></div>
            <div className="field">
              <label>Papel</label>
              <select name="role" defaultValue="MEMBER">
                {ROLE_ORDER.filter((role) => isOwner || role !== 'OWNER').map((role) => <option value={role} key={role}>{ROLE_DEFINITIONS[role].label}</option>)}
              </select>
              <small className="muted">Conceda somente o nível necessário para a função da pessoa.</small>
            </div>
            <div className="field">
              <div className="field-label-row"><label>Senha inicial</label><button type="button" className="text-link" onClick={createStrongPassword}>Gerar senha forte</button></div>
              <div className="password-row">
                <input name="password" type="text" minLength={12} maxLength={128} value={generatedPassword} onChange={(event) => setGeneratedPassword(event.target.value)} autoComplete="new-password" required />
                <button type="button" className="btn ghost" onClick={copyPassword} disabled={!generatedPassword}>Copiar</button>
              </div>
              <small className="muted">Mínimo de 12 caracteres. Não reutilize senhas de outros serviços.</small>
            </div>

            <div className="security-note">
              <Icon name="shield" size={18} />
              <div><strong>Princípio do menor privilégio</strong><span>Prefira MEMBER, SDR ou VIEWER quando o usuário não precisar administrar configurações.</span></div>
            </div>

            <button className="btn primary full" disabled={submitting}>{submitting ? 'Criando usuário…' : 'Criar usuário'}</button>
          </form>
        </div>
      )}
    </>
  );
}

function Metric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: any }) {
  return (
    <div className="metric-card team-metric-card">
      <span className="metric-icon blue"><Icon name={icon} size={18} /></span>
      <div className="metric-card-copy"><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

function secureRandomIndex(max: number) {
  if (max <= 1) return 0;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}
