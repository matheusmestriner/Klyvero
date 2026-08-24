'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { Icon } from '../../../components/icon';
import { PageTitle } from '../../../components/resource-page';

type Schedule = 'MANUAL' | 'HOURLY' | 'EVERY_6_HOURS' | 'DAILY' | 'WEEKLY';

type ProspectingAgent = {
  id: string;
  name: string;
  businessType: string;
  locations: string[];
  radiusKm: number;
  limitPerLocation: number;
  minScore: number;
  requirePhone: boolean;
  requireEmail: boolean;
  requireWebsite: boolean;
  includeKeywords: string[];
  excludeKeywords: string[];
  schedule: Schedule;
  workdayStart: string;
  workdayEnd: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
};

type ProspectCompany = {
  id?: string;
  name: string;
  category?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  website?: string;
  score: number;
  matchedLocation: string;
};

type RunSummary = {
  agentId: string;
  searchedLocations: number;
  found: number;
  qualified: number;
  rejected: number;
  finishedAt: string;
};

const STORAGE_KEY = 'klyvero.aiProspectingAgents.v1';
const RUN_KEY = 'klyvero.aiProspectingRuns.v1';

const SCHEDULE_LABELS: Record<Schedule, string> = {
  MANUAL: 'Somente manual',
  HOURLY: 'A cada hora',
  EVERY_6_HOURS: 'A cada 6 horas',
  DAILY: 'Todos os dias',
  WEEKLY: 'Semanalmente',
};

const RADIUS_OPTIONS = [1, 3, 5, 10, 20, 30, 50, 100];

export default function AiAgentsPage() {
  const [agents, setAgents] = useState<ProspectingAgent[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [runningId, setRunningId] = useState('');
  const [results, setResults] = useState<ProspectCompany[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setAgents(parsed);
    } catch {
      setAgents([]);
    }
  }, []);

  function persist(next: ProspectingAgent[]) {
    setAgents(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const metrics = useMemo(() => ({
    total: agents.length,
    enabled: agents.filter((agent) => agent.enabled).length,
    scheduled: agents.filter((agent) => agent.schedule !== 'MANUAL').length,
    locations: agents.reduce((sum, agent) => sum + agent.locations.length, 0),
  }), [agents]);

  function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const businessType = String(form.get('businessType') || '').trim();
    const locations = splitLines(String(form.get('locations') || ''));

    if (name.length < 2 || businessType.length < 2 || locations.length === 0) {
      setError('Informe nome, nicho e pelo menos uma cidade/UF para o agente.');
      return;
    }

    const agent: ProspectingAgent = {
      id: crypto.randomUUID(),
      name,
      businessType,
      locations,
      radiusKm: clamp(Number(form.get('radiusKm') || 10), 1, 100),
      limitPerLocation: clamp(Number(form.get('limitPerLocation') || 50), 1, 100),
      minScore: clamp(Number(form.get('minScore') || 55), 0, 100),
      requirePhone: form.get('requirePhone') === 'on',
      requireEmail: form.get('requireEmail') === 'on',
      requireWebsite: form.get('requireWebsite') === 'on',
      includeKeywords: splitCsv(String(form.get('includeKeywords') || '')),
      excludeKeywords: splitCsv(String(form.get('excludeKeywords') || '')),
      schedule: String(form.get('schedule') || 'MANUAL') as Schedule,
      workdayStart: String(form.get('workdayStart') || '08:00'),
      workdayEnd: String(form.get('workdayEnd') || '18:00'),
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    persist([agent, ...agents]);
    setShowCreate(false);
    setError('');
    setNotice('Agente de prospecção criado. Você já pode executar a busca agora.');
  }

  function toggleAgent(agent: ProspectingAgent) {
    persist(agents.map((row) => row.id === agent.id ? { ...row, enabled: !row.enabled } : row));
  }

  function removeAgent(agent: ProspectingAgent) {
    if (!window.confirm(`Excluir o agente “${agent.name}”?`)) return;
    persist(agents.filter((row) => row.id !== agent.id));
    if (summary?.agentId === agent.id) {
      setSummary(null);
      setResults([]);
    }
  }

  async function runAgent(agent: ProspectingAgent) {
    if (runningId) return;
    setRunningId(agent.id);
    setError('');
    setNotice('');
    setSummary(null);
    setResults([]);

    try {
      const collected: ProspectCompany[] = [];
      for (const location of agent.locations) {
        const { city, state } = parseLocation(location);
        if (!city) continue;

        const payload = await api('/prospecting/search', {
          method: 'POST',
          body: JSON.stringify({
            query: agent.businessType,
            businessType: agent.businessType,
            industry: agent.businessType,
            country: 'BR',
            state,
            city,
            radiusKm: agent.radiusKm,
            limit: agent.limitPerLocation,
          }),
        });

        normalizeCompanies(payload, location).forEach((company) => collected.push(company));
      }

      const unique = deduplicate(collected)
        .map((company) => ({ ...company, score: scoreCompany(company, agent) }))
        .sort((a, b) => b.score - a.score);
      const qualified = unique.filter((company) => qualifies(company, agent));
      const finishedAt = new Date().toISOString();
      const run: RunSummary = {
        agentId: agent.id,
        searchedLocations: agent.locations.length,
        found: unique.length,
        qualified: qualified.length,
        rejected: Math.max(unique.length - qualified.length, 0),
        finishedAt,
      };

      setResults(qualified);
      setSummary(run);
      persist(agents.map((row) => row.id === agent.id ? { ...row, lastRunAt: finishedAt } : row));
      saveRun(run);
      setNotice(`Execução concluída: ${qualified.length} prospect${qualified.length === 1 ? '' : 's'} qualificado${qualified.length === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível executar a prospecção deste agente.');
    } finally {
      setRunningId('');
    }
  }

  return (
    <>
      <PageTitle
        title="Agentes IA"
        subtitle="Programe agentes para localizar, filtrar e qualificar empresas em regiões específicas."
        action={
          <button className="btn primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={16} /> Novo agente
          </button>
        }
      />

      <div className="notice" style={{ marginBottom: 16 }}>
        <strong>Prospecção autônoma por território.</strong>{' '}
        Cada agente pode trabalhar com nichos, cidades, raio, limites e critérios próprios. A execução em segundo plano com o navegador fechado será ativada pelo worker do backend; nesta versão, “Executar agora” já usa o motor real de prospecção geográfica.
      </div>

      {notice && <div className="notice" style={{ marginBottom: 16 }}>{notice}</div>}
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, marginBottom: 16 }}>
        <Metric label="Agentes" value={metrics.total} detail="configurados" />
        <Metric label="Ativos" value={metrics.enabled} detail="liberados para execução" />
        <Metric label="Agendados" value={metrics.scheduled} detail="com frequência definida" />
        <Metric label="Territórios" value={metrics.locations} detail="cidades configuradas" />
      </div>

      {agents.length ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {agents.map((agent) => (
            <section className="card spaced-lg" key={agent.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="eyebrow">Agente de prospecção</span>
                    <span className="badge">{agent.enabled ? 'Ativo' : 'Pausado'}</span>
                  </div>
                  <h3 style={{ margin: '6px 0 4px' }}>{agent.name}</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    {agent.businessType} · {agent.locations.length} território(s) · até {agent.radiusKm} km · score mínimo {agent.minScore}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn ghost" onClick={() => toggleAgent(agent)}>{agent.enabled ? 'Pausar' : 'Ativar'}</button>
                  <button className="btn primary" disabled={Boolean(runningId) || !agent.enabled} onClick={() => runAgent(agent)}>
                    <Icon name="search" size={15} /> {runningId === agent.id ? 'Prospectando…' : 'Executar agora'}
                  </button>
                  <button className="btn ghost" onClick={() => removeAgent(agent)}>Excluir</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginTop: 16 }}>
                <Info label="Frequência" value={SCHEDULE_LABELS[agent.schedule]} />
                <Info label="Janela" value={`${agent.workdayStart}–${agent.workdayEnd}`} />
                <Info label="Limite" value={`${agent.limitPerLocation} por território`} />
                <Info label="Última execução" value={agent.lastRunAt ? formatDate(agent.lastRunAt) : 'Ainda não executado'} />
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {agent.locations.map((location) => <span className="badge" key={location}>{location}</span>)}
                {agent.requirePhone && <span className="badge">Telefone obrigatório</span>}
                {agent.requireEmail && <span className="badge">E-mail obrigatório</span>}
                {agent.requireWebsite && <span className="badge">Site obrigatório</span>}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="card empty-state">
          <Icon name="ai" size={34} />
          <strong>Nenhum agente de prospecção configurado</strong>
          <span>Crie um agente, defina nicho e regiões e deixe os critérios de qualificação preparados.</span>
          <button className="btn primary" onClick={() => setShowCreate(true)}><Icon name="plus" size={15}/> Criar primeiro agente</button>
        </section>
      )}

      {summary && (
        <section className="card spaced-lg" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <span className="eyebrow">Última execução</span>
              <h3 style={{ margin: '5px 0 0' }}>Prospects qualificados pelo agente</h3>
              <p className="muted" style={{ margin: '5px 0 0' }}>
                {summary.found} encontrados · {summary.qualified} qualificados · {summary.rejected} descartados pelos critérios.
              </p>
            </div>
            <span className="badge">{summary.searchedLocations} território(s)</span>
          </div>

          {results.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Score</th><th>Empresa</th><th>Ramo</th><th>Território</th><th>Contato</th><th>Site</th></tr></thead>
                <tbody>
                  {results.map((company, index) => (
                    <tr key={company.id || `${company.name}-${index}`}>
                      <td><strong>{company.score}</strong>/100</td>
                      <td><strong>{company.name}</strong><div className="muted">{company.address || '—'}</div></td>
                      <td>{company.category || '—'}</td>
                      <td>{company.matchedLocation}</td>
                      <td>
                        <div style={{ display: 'grid', gap: 3 }}>
                          {company.phone && <span>{company.phone}</span>}
                          {company.email && <span>{company.email}</span>}
                          {!company.phone && !company.email && '—'}
                        </div>
                      </td>
                      <td>{company.website ? <a className="btn ghost" href={ensureHttp(company.website)} target="_blank" rel="noreferrer">Abrir <Icon name="arrow-up-right" size={13}/></a> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state"><Icon name="target" size={30}/><strong>Nenhum prospect passou pelos critérios</strong><span>Reduza o score mínimo ou flexibilize os dados obrigatórios.</span></div>
          )}
        </section>
      )}

      {showCreate && (
        <div className="modalback" onMouseDown={(event) => event.target === event.currentTarget && setShowCreate(false)}>
          <form className="modal" onSubmit={createAgent} style={{ width: 'min(760px,calc(100vw - 32px))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div><span className="eyebrow">Novo agente</span><h3 style={{ margin: '4px 0 0' }}>Programar prospecção autônoma</h3></div>
              <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setShowCreate(false)}><Icon name="x"/></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 18 }}>
              <label><span>Nome do agente</span><input name="name" required placeholder="Ex.: Hunter Clínicas SP" /></label>
              <label><span>Nicho / ramo</span><input name="businessType" required placeholder="Ex.: clínicas odontológicas" /></label>
            </div>

            <label style={{ marginTop: 12 }}>
              <span>Territórios — uma cidade por linha</span>
              <textarea name="locations" required rows={5} placeholder={'Campinas/SP\nValinhos/SP\nVinhedo/SP'} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 12 }}>
              <label><span>Raio</span><select name="radiusKm" defaultValue="10">{RADIUS_OPTIONS.map((radius) => <option value={radius} key={radius}>{radius} km</option>)}</select></label>
              <label><span>Limite/local</span><input name="limitPerLocation" type="number" min="1" max="100" defaultValue="50" /></label>
              <label><span>Score mínimo</span><input name="minScore" type="number" min="0" max="100" defaultValue="55" /></label>
              <label><span>Frequência</span><select name="schedule" defaultValue="DAILY">{Object.entries(SCHEDULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <label><span>Palavras desejadas</span><input name="includeKeywords" placeholder="premium, empresarial, 24h" /></label>
              <label><span>Palavras excluídas</span><input name="excludeKeywords" placeholder="fechado, temporariamente, residencial" /></label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <label><span>Início da janela</span><input name="workdayStart" type="time" defaultValue="08:00" /></label>
              <label><span>Fim da janela</span><input name="workdayEnd" type="time" defaultValue="18:00" /></label>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
              <Check name="requirePhone" label="Exigir telefone" defaultChecked />
              <Check name="requireEmail" label="Exigir e-mail" />
              <Check name="requireWebsite" label="Exigir website" />
            </div>

            <div className="notice" style={{ marginTop: 16 }}>
              O agente pesquisa e qualifica empresas. Ações de contato automático serão configuradas separadamente com limites, opt-out, horário comercial e trilha de auditoria.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" className="btn ghost" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn primary" type="submit"><Icon name="sparkles" size={15}/> Criar agente</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="card" style={{ padding: 16 }}><span className="muted">{label}</span><strong style={{ display: 'block', fontSize: 26, marginTop: 4 }}>{value}</strong><small className="muted">{detail}</small></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}><span className="muted" style={{ display: 'block', fontSize: 12 }}>{label}</span><strong style={{ display: 'block', marginTop: 4 }}>{value}</strong></div>;
}

function Check({ name, label, defaultChecked = false }: { name: string; label: string; defaultChecked?: boolean }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><input type="checkbox" name={name} defaultChecked={defaultChecked} style={{ width: 16, height: 16 }}/><span>{label}</span></label>;
}

function splitLines(value: string) {
  return Array.from(new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))).slice(0, 25);
}

function splitCsv(value: string) {
  return Array.from(new Set(value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))).slice(0, 20);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseLocation(value: string) {
  const match = value.trim().match(/^(.+?)(?:\s*[/,-]\s*([A-Za-z]{2}))?$/);
  return { city: match?.[1]?.trim() || value.trim(), state: (match?.[2] || '').toUpperCase() };
}

function normalizeCompanies(payload: any, matchedLocation: string): ProspectCompany[] {
  const raw = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.data) ? payload.data : [];
  return raw.map((item: any) => ({
    id: item?.id || item?.placeId || item?.place_id,
    name: String(item?.name || item?.companyName || item?.title || '').trim(),
    category: item?.category || item?.industry || item?.businessType || item?.type,
    address: item?.address || item?.formattedAddress || item?.formatted_address,
    city: item?.city || item?.municipality,
    state: item?.state || item?.region || item?.uf,
    phone: item?.phone || item?.phoneNumber || item?.formatted_phone_number,
    email: item?.email,
    website: item?.website || item?.site || item?.url,
    score: 0,
    matchedLocation,
  })).filter((item: ProspectCompany) => item.name.length > 0);
}

function deduplicate(rows: ProspectCompany[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = normalizeKey(row.website || row.phone || `${row.name}|${row.address || row.matchedLocation}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[^a-z0-9]/g, '');
}

function scoreCompany(company: ProspectCompany, agent: ProspectingAgent) {
  let score = 35;
  if (company.phone) score += 18;
  if (company.email) score += 18;
  if (company.website) score += 14;
  if (company.address) score += 5;

  const haystack = `${company.name} ${company.category || ''} ${company.address || ''}`.toLowerCase();
  const segmentTokens = agent.businessType.toLowerCase().split(/\s+/).filter((token) => token.length >= 4);
  if (segmentTokens.some((token) => haystack.includes(token))) score += 10;
  score += Math.min(10, agent.includeKeywords.filter((keyword) => haystack.includes(keyword)).length * 5);
  score -= Math.min(40, agent.excludeKeywords.filter((keyword) => haystack.includes(keyword)).length * 20);
  return clamp(score, 0, 100);
}

function qualifies(company: ProspectCompany, agent: ProspectingAgent) {
  if (company.score < agent.minScore) return false;
  if (agent.requirePhone && !company.phone) return false;
  if (agent.requireEmail && !company.email) return false;
  if (agent.requireWebsite && !company.website) return false;
  const haystack = `${company.name} ${company.category || ''} ${company.address || ''}`.toLowerCase();
  if (agent.excludeKeywords.some((keyword) => haystack.includes(keyword))) return false;
  return true;
}

function saveRun(run: RunSummary) {
  try {
    const raw = window.localStorage.getItem(RUN_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    const history = Array.isArray(rows) ? rows : [];
    window.localStorage.setItem(RUN_KEY, JSON.stringify([run, ...history].slice(0, 50)));
  } catch {
    // A falha no histórico local não invalida a prospecção concluída.
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function ensureHttp(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
