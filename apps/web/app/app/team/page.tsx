'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../components/app-shell';
import { PageTitle } from '../../../components/resource-page';
import { Icon } from '../../../components/icon';
import { CsvColumn, csvDateStamp, downloadCsv, parseCsvFile, resolveCsvValue } from '../../../lib/csv';

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
type RoleDefinition = { label: string; summary: string; permissions: string[]; tone: string };
type ImportFailure = { line: number; message: string };
type ImportedCredential = { name: string; email: string; password: string };

const ROLE_DEFINITIONS: Record<RoleKey, RoleDefinition> = {
  OWNER: { label: 'Proprietário', summary: 'Controle total do workspace e das decisões administrativas.', permissions: ['Administração total', 'Equipe e papéis', 'Integrações', 'Dados comerciais', 'Configurações sensíveis'], tone: 'violet' },
  ADMIN: { label: 'Administrador', summary: 'Administra operação, usuários e configurações sem assumir a propriedade.', permissions: ['Equipe', 'Integrações', 'CRM', 'Campanhas', 'Analytics'], tone: 'blue' },
  MANAGER: { label: 'Gestor', summary: 'Coordena a operação comercial e acompanha resultados da equipe.', permissions: ['CRM', 'Leads', 'Campanhas', 'Analytics', 'Agenda'], tone: 'cyan' },
  SDR: { label: 'SDR', summary: 'Executa prospecção, cadências e qualificação de leads.', permissions: ['Prospecção', 'Leads', 'Contatos', 'Campanhas', 'Inbox'], tone: 'green' },
  MEMBER: { label: 'Membro', summary: 'Acesso operacional padrão aos recursos liberados no workspace.', permissions: ['CRM', 'Contatos', 'Tarefas', 'Inbox'], tone: 'amber' },
  VIEWER: { label: 'Visualizador', summary: 'Consulta informações sem permissão para administrar o workspace.', permissions: ['Consulta de dados', 'Dashboard', 'Analytics permitido'], tone: 'slate' },
};

const ROLE_ORDER: RoleKey[] = ['OWNER', 'ADMIN', 'MANAGER', 'SDR', 'MEMBER', 'VIEWER'];
const TEAM_EXPORT_COLUMNS: CsvColumn[] = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'role', label: 'Papel' },
  { key: 'active', label: 'Ativo' },
  { key: 'lastLoginAt', label: 'Último login' },
  { key: 'createdAt', label: 'Criado em' },
];
const TEAM_IMPORT_COLUMNS: CsvColumn[] = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'role', label: 'Papel' },
];
const CREDENTIAL_COLUMNS: CsvColumn[] = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'password', label: 'Senha temporária' },
];

export default function TeamPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<TeamUser[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | RoleKey>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importedCredentials, setImportedCredentials] = useState<ImportedCredential[]>([]);
  const [importFailures, setImportFailures] = useState<ImportFailure[]>([]);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'notice' | 'error'>('notice');
  const [generatedPassword, setGeneratedPassword] = useState('');

  const isOwner = user?.role === 'OWNER';

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const payload = await api(`/tenants/${user.tenantId}/users`);
      const data = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
      setRows(data);
    } catch (error: any) {
      setRows([]);
      setMessageType('error');
      setMessage(error?.message || 'Não foi possível carregar a equipe.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
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
    const loggedRecently = rows.filter((row) => row.lastLoginAt && Date.now() - new Date(row.lastLoginAt).getTime() <= 7 * 24 * 60 * 60 * 1000).length;
    return { total: rows.length, active, admins, loggedRecently };
  }, [rows]);

  function openCreate() {
    setGeneratedPassword('');
    setMessage('');
    setShowCreate(true);
  }

  function openImport() {
    setImportFile(null);
    setImportedCredentials([]);
    setImportFailures([]);
    setMessage('');
    setShowImport(true);
  }

  function closeImport() {
    if (importing) return;
    setShowImport(false);
    setImportFile(null);
    setImportedCredentials([]);
    setImportFailures([]);
  }

  function createStrongPassword() {
    setGeneratedPassword(createStrongPasswordValue());
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

  function exportUsers() {
    downloadCsv(`klyvero-equipe-${csvDateStamp()}.csv`, rows, TEAM_EXPORT_COLUMNS);
    setMessageType('notice');
    setMessage(`${rows.length} usuário(s) exportado(s). Senhas e credenciais não são incluídas.`);
  }

  function exportImportTemplate() {
    downloadCsv('modelo-equipe-klyvero.csv', [], TEAM_IMPORT_COLUMNS);
  }

  function exportTemporaryCredentials() {
    if (!importedCredentials.length) return;
    downloadCsv(`credenciais-temporarias-${csvDateStamp()}.csv`, importedCredentials, CREDENTIAL_COLUMNS);
  }

  async function importUsers() {
    if (!user || !importFile || importing) return;
    setImporting(true);
    setImportFailures([]);
    setImportedCredentials([]);
    setMessage('');

    try {
      const parsed = parseCsvFile(await importFile.text());
      if (!parsed.rows.length) throw new Error('O CSV não contém usuários para importar.');

      const failures: ImportFailure[] = [];
      const credentials: ImportedCredential[] = [];

      for (let index = 0; index < parsed.rows.length; index += 1) {
        const sourceRow = parsed.rows[index];
        const name = resolveCsvValue(sourceRow, { key: 'name', label: 'Nome' }).trim();
        const email = resolveCsvValue(sourceRow, { key: 'email', label: 'E-mail', aliases: ['Email'] }).trim().toLowerCase();
        const roleRaw = resolveCsvValue(sourceRow, { key: 'role', label: 'Papel' }).trim().toUpperCase() || 'MEMBER';
        const role = roleRaw as RoleKey;

        if (!name) {
          failures.push({ line: index + 2, message: 'Nome é obrigatório.' });
          continue;
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          failures.push({ line: index + 2, message: 'E-mail inválido.' });
          continue;
        }
        if (!ROLE_ORDER.includes(role)) {
          failures.push({ line: index + 2, message: `Papel inválido: ${roleRaw}.` });
          continue;
        }
        if (role === 'OWNER' && !isOwner) {
          failures.push({ line: index + 2, message: 'Somente o proprietário pode importar outro OWNER.' });
          continue;
        }

        const password = createStrongPasswordValue();
        try {
          await api(`/tenants/${user.tenantId}/users`, {
            method: 'POST',
            body: JSON.stringify({ name, email, password, role }),
          });
          credentials.push({ name, email, password });
        } catch (rowError: any) {
          failures.push({ line: index + 2, message: rowError?.message || 'Falha ao criar usuário.' });
        }
      }

      setImportFailures(failures);
      setImportedCredentials(credentials);
      if (credentials.length) {
        setMessageType('notice');
        setMessage(`${credentials.length} usuário(s) importado(s). As senhas temporárias são exibidas somente nesta etapa.`);
        await load();
      }
    } catch (error: any) {
      setMessageType('error');
      setMessage(error?.message || 'Não foi possível importar a equipe.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <PageTitle
        title="Equipe e permissões"
        subtitle="Gerencie pessoas, papéis e o nível de acesso ao workspace."
        action={
          <div className="page-actions data-transfer-actions">
            <button className="btn ghost" type="button" onClick={openImport}>Importar</button>
            <button className="btn ghost" type="button" onClick={exportUsers}>Exportar</button>
            <button className="btn primary" type="button" onClick={openCreate}><Icon name="plus" size={16} /> Novo usuário</button>
          </div>
        }
      />

      {message && <div className={messageType === 'error' ? 'error' : 'notice'}>{message}</div>}

      <div className="team-metrics">
        <Metric label="Usuários" value={stats.total} detail="cadastrados" icon="team" />
        <Metric label="Ativos" value={stats.active} detail={`${Math.max(stats.total - stats.active, 0)} inativo(s)`} icon="users" />
        <Metric label="Administradores" value={stats.admins} detail="OWNER + ADMIN" icon="audit" />
        <Metric label="Ativos em 7 dias" value={stats.loggedRecently} detail="com login recente" icon="clock" />
      </div>

      <section className="card spaced-lg team-directory-card">
        <div className="team-toolbar">
          <div><span className="eyebrow">Diretório</span><h3>Pessoas do workspace</h3><p className="muted">Busque por nome ou e-mail e filtre por papel ou status.</p></div>
          <button className="btn ghost" onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>
        </div>

        <div className="team-filters">
          <div className="team-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuário..." /></div>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'ALL' | RoleKey)} aria-label="Filtrar por papel">
            <option value="ALL">Todos os papéis</option>
            {ROLE_ORDER.map((role) => <option value={role} key={role}>{ROLE_DEFINITIONS[role].label}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')} aria-label="Filtrar por status">
            <option value="ALL">Todos os status</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option>
          </select>
        </div>

        {loading ? (
          <div className="team-loading"><span className="auth-runtime-spinner" /><span>Carregando equipe…</span></div>
        ) : filteredRows.length ? (
          <div className="team-table-wrap">
            <table className="table team-table">
              <thead><tr><th>Usuário</th><th>Papel</th><th>Status</th><th>Último login</th><th>Criado em</th></tr></thead>
              <tbody>{filteredRows.map((row) => {
                const definition = ROLE_DEFINITIONS[row.role] || ROLE_DEFINITIONS.MEMBER;
                return <tr key={row.id}>
                  <td><div className="team-user-cell"><span className="team-avatar">{initials(row.name)}</span><div><strong>{row.name}</strong><span>{row.email}</span></div></div></td>
                  <td><span className={`role-badge ${definition.tone}`}>{definition.label}</span></td>
                  <td><span className={`role-badge ${row.active ? 'status-active' : 'status-inactive'}`}>{row.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td>{formatDate(row.lastLoginAt)}</td><td>{formatDate(row.createdAt, true)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <div className="empty-state compact"><Icon name="team" size={28} /><strong>Nenhum usuário encontrado</strong><span>Ajuste os filtros ou cadastre um novo usuário.</span></div>}
      </section>

      <section className="card spaced-lg">
        <span className="eyebrow">Papéis padrão</span><h3>Matriz de acesso</h3><p className="muted">Os papéis abaixo definem o ponto de partida do RBAC. Permissões granulares serão aplicadas sobre esta base.</p>
        <div className="role-grid">{ROLE_ORDER.map((role) => {
          const definition = ROLE_DEFINITIONS[role];
          return <article className="role-card" key={role}><div className="role-card-head"><span className={`role-badge ${definition.tone}`}>{definition.label}</span><code>{role}</code></div><p>{definition.summary}</p><div className="role-permissions">{definition.permissions.map((permission) => <span key={permission}><Icon name="check" size={12} /> {permission}</span>)}</div></article>;
        })}</div>
      </section>

      {showCreate && <div className="modalback"><form className="modal team-user-modal" onSubmit={createUser}>
        <div className="modalhead"><div><h3>Novo usuário</h3><p className="muted">Atribua somente o nível de acesso necessário.</p></div><button type="button" className="btn ghost" onClick={() => setShowCreate(false)} disabled={submitting}>Fechar</button></div>
        <div className="field"><label>Nome</label><input name="name" required /></div>
        <div className="field"><label>E-mail</label><input name="email" type="email" required /></div>
        <div className="field"><div className="field-label-row"><label>Senha inicial</label><button type="button" className="text-link" onClick={createStrongPassword}>Gerar senha forte</button></div><div className="password-row"><input name="password" value={generatedPassword} onChange={(event) => setGeneratedPassword(event.target.value)} type="text" minLength={12} required /><button type="button" className="btn ghost" onClick={copyPassword} disabled={!generatedPassword}>Copiar</button></div></div>
        <div className="field"><label>Papel</label><select name="role" defaultValue="MEMBER">{ROLE_ORDER.filter((role) => isOwner || role !== 'OWNER').map((role) => <option key={role} value={role}>{ROLE_DEFINITIONS[role].label}</option>)}</select></div>
        <div className="security-note"><Icon name="audit" size={17} /><div><strong>Princípio do menor privilégio</strong><span>Conceda apenas as permissões necessárias para a função do usuário.</span></div></div>
        <button className="btn primary spaced" disabled={submitting}>{submitting ? 'Criando…' : 'Criar usuário'}</button>
      </form></div>}

      {showImport && <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && closeImport()}>
        <div className="modal team-user-modal data-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="team-import-title">
          <div className="modalhead"><div><h3 id="team-import-title">Importar equipe</h3><p className="muted">Use Nome, E-mail e Papel. A senha temporária é gerada localmente para cada usuário.</p></div><button type="button" className="btn ghost" onClick={closeImport} disabled={importing}>Fechar</button></div>
          <div className="import-help"><strong>Colunas aceitas</strong><span>Nome · E-mail · Papel (OWNER, ADMIN, MANAGER, SDR, MEMBER ou VIEWER)</span><button type="button" className="btn ghost compact" onClick={exportImportTemplate}>Baixar modelo CSV</button></div>
          <label className="csv-dropzone"><span>{importFile ? importFile.name : 'Selecionar arquivo CSV'}</span><small>{importFile ? `${Math.max(1, Math.round(importFile.size / 1024))} KB` : 'Até 500 usuários por arquivo. CSV com vírgula ou ponto e vírgula.'}</small><input type="file" accept=".csv,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportedCredentials([]); setImportFailures([]); }} disabled={importing} /></label>

          {(importedCredentials.length > 0 || importFailures.length > 0) && <div className={`import-result ${importFailures.length ? 'with-errors' : 'success'}`}><strong>{importedCredentials.length} importado(s)</strong><span>{importFailures.length} linha(s) com erro.</span>{importFailures.length > 0 && <ul>{importFailures.slice(0, 8).map((failure) => <li key={`${failure.line}-${failure.message}`}>Linha {failure.line}: {failure.message}</li>)}{importFailures.length > 8 && <li>Mais {importFailures.length - 8} erro(s) não exibido(s).</li>}</ul>}</div>}

          {importedCredentials.length > 0 && <div className="security-note"><Icon name="audit" size={17} /><div><strong>Credenciais temporárias</strong><span>Baixe agora as senhas geradas e armazene-as em local seguro. Elas não aparecem na exportação normal da equipe e são removidas da tela ao fechar este modal.</span><button type="button" className="btn ghost compact" onClick={exportTemporaryCredentials}>Baixar credenciais temporárias</button></div></div>}

          <div className="data-transfer-footer"><button type="button" className="btn ghost" onClick={closeImport} disabled={importing}>Cancelar</button><button type="button" className="btn primary" onClick={importUsers} disabled={!importFile || importing}>{importing ? 'Importando…' : 'Importar usuários'}</button></div>
        </div>
      </div>}
    </>
  );
}

function Metric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: 'team' | 'users' | 'audit' | 'clock' }) {
  return <div className="card team-metric-card"><div className="metric-icon"><Icon name={icon} size={18} /></div><span className="muted">{label}</span><strong className="metric-value">{value}</strong><small>{detail}</small></div>;
}

function createStrongPasswordValue() {
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
  return chars.join('');
}

function secureRandomIndex(max: number) {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function formatDate(value?: string | null, dateOnly = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateOnly ? date.toLocaleDateString('pt-BR') : date.toLocaleString('pt-BR');
}
