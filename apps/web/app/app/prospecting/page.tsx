'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, session } from '../../../lib/api';
import { Icon } from '../../../components/icon';
import { PageTitle } from '../../../components/resource-page';

type ProspectCompany = {
  id: string;
  name: string;
  category?: string;
  address?: string;
  city?: string;
  state?: string;
  distanceKm?: number;
  phone?: string;
  email?: string;
  website?: string;
  lat?: number;
  lon?: number;
  score?: number;
};

type SearchMeta = {
  query: string;
  city: string;
  state: string;
  radiusKm: number;
  total: number;
  generatedAt?: string;
};

type ContactFilter = 'ALL' | 'CONTACT' | 'EMAIL' | 'PHONE' | 'WEBSITE';
type SortMode = 'SCORE' | 'DISTANCE' | 'NAME';

const BRAZIL_STATES = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'],
  ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
  ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'],
  ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
  ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
] as const;

const RADIUS_OPTIONS = [1, 3, 5, 10, 20, 30, 50, 100];
const LIMIT_OPTIONS = [10, 20, 30, 50];

export default function ProspectingPage() {
  const [businessType, setBusinessType] = useState('');
  const [state, setState] = useState('SP');
  const [city, setCity] = useState('');
  const [radiusKm, setRadiusKm] = useState(10);
  const [limit, setLimit] = useState(30);
  const [results, setResults] = useState<ProspectCompany[]>([]);
  const [meta, setMeta] = useState<SearchMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('SCORE');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [detail, setDetail] = useState<ProspectCompany | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('klyvero.prospecting.last-search');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (typeof parsed?.businessType === 'string') setBusinessType(parsed.businessType);
      if (typeof parsed?.state === 'string') setState(parsed.state);
      if (typeof parsed?.city === 'string') setCity(parsed.city);
      if (Number.isFinite(Number(parsed?.radiusKm))) setRadiusKm(Number(parsed.radiusKm));
      if (Number.isFinite(Number(parsed?.limit))) setLimit(Number(parsed.limit));
    } catch {
      // Ignore malformed local preferences.
    }
  }, []);

  const filteredResults = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    const rows = results.filter((company) => {
      const matchesText = !normalizedQuery || [
        company.name,
        company.category,
        company.address,
        company.city,
        company.state,
        company.phone,
        company.email,
        company.website,
      ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(normalizedQuery));

      const matchesContact = contactFilter === 'ALL'
        || (contactFilter === 'CONTACT' && Boolean(company.email || company.phone || company.website))
        || (contactFilter === 'EMAIL' && Boolean(company.email))
        || (contactFilter === 'PHONE' && Boolean(company.phone))
        || (contactFilter === 'WEBSITE' && Boolean(company.website));

      return matchesText && matchesContact;
    });

    return [...rows].sort((a, b) => {
      if (sortMode === 'DISTANCE') return Number(a.distanceKm ?? Number.MAX_SAFE_INTEGER) - Number(b.distanceKm ?? Number.MAX_SAFE_INTEGER);
      if (sortMode === 'NAME') return a.name.localeCompare(b.name, 'pt-BR');
      return Number(b.score || 0) - Number(a.score || 0)
        || Number(a.distanceKm ?? Number.MAX_SAFE_INTEGER) - Number(b.distanceKm ?? Number.MAX_SAFE_INTEGER);
    });
  }, [contactFilter, query, results, sortMode]);

  const selectedRows = useMemo(
    () => results.filter((company) => selected.has(company.id) && !saved.has(company.id)),
    [results, saved, selected],
  );

  const metrics = useMemo(() => {
    const withContact = results.filter((company) => company.email || company.phone || company.website).length;
    const withEmail = results.filter((company) => company.email).length;
    const withPhone = results.filter((company) => company.phone).length;
    const highScore = results.filter((company) => Number(company.score || 0) >= 70).length;
    return { total: results.length, withContact, withEmail, withPhone, highScore };
  }, [results]);

  const searchSummary = useMemo(() => {
    if (!searched) return '';
    const searchCity = meta?.city || city.trim();
    const searchState = meta?.state || state;
    const searchRadius = meta?.radiusKm || radiusKm;
    return `${results.length} empresa${results.length === 1 ? '' : 's'} encontrada${results.length === 1 ? '' : 's'} em até ${searchRadius} km de ${searchCity} / ${searchState}.`;
  }, [city, meta, radiusKm, results.length, searched, state]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const segment = businessType.trim();
    const targetCity = city.trim();

    if (segment.length < 2) {
      setError('Informe o ramo de negócio que deseja prospectar.');
      return;
    }
    if (targetCity.length < 2) {
      setError('Informe a cidade da busca.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');
    setSearched(false);
    setSelected(new Set());
    setDetail(null);

    try {
      const payload = await searchProspects({
        businessType: segment,
        state,
        city: targetCity,
        radiusKm,
        limit,
      });
      const rows = normalizeCompanies(payload);
      setResults(rows);
      setMeta(payload?.meta || null);
      setSearched(true);
      window.localStorage.setItem('klyvero.prospecting.last-search', JSON.stringify({ businessType: segment, state, city: targetCity, radiusKm, limit }));
    } catch (err: any) {
      setResults([]);
      setMeta(null);
      setSearched(true);
      setError(err?.message || 'Não foi possível consultar empresas agora. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  }

  async function searchProspects(searchBody: Record<string, unknown>, retry = true): Promise<any> {
    const response = await fetch('/api/prospecting/search', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(session.get() ? { authorization: `Bearer ${session.get()}` } : {}),
      },
      body: JSON.stringify(searchBody),
    });

    if (response.status === 401 && retry) {
      const refreshed = await api('/auth/refresh', { method: 'POST' });
      session.set(refreshed.accessToken);
      return searchProspects(searchBody, false);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
    return payload;
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const selectable = filteredResults.filter((row) => !saved.has(row.id));
    const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.id));
    setSelected((current) => {
      const next = new Set(current);
      selectable.forEach((row) => allSelected ? next.delete(row.id) : next.add(row.id));
      return next;
    });
  }

  async function saveLead(company: ProspectCompany, quiet = false) {
    if (saved.has(company.id) || saving.has(company.id)) return true;

    setSaving((current) => new Set(current).add(company.id));
    if (!quiet) {
      setError('');
      setNotice('');
    }

    try {
      await api('/leads', {
        method: 'POST',
        body: JSON.stringify({
          name: company.name,
          companyName: company.name,
          company: company.name,
          email: company.email || undefined,
          phone: company.phone || undefined,
          website: company.website || undefined,
          source: 'PROSPECTING',
          status: 'NEW',
          city: company.city || meta?.city || city,
          state: company.state || meta?.state || state,
          notes: buildLeadNote(company),
        }),
      });
      setSaved((current) => new Set(current).add(company.id));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(company.id);
        return next;
      });
      if (!quiet) setNotice(`${company.name} foi adicionada aos Leads.`);
      return true;
    } catch (err: any) {
      if (!quiet) setError(err?.message || `Não foi possível adicionar ${company.name} aos Leads.`);
      return false;
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        next.delete(company.id);
        return next;
      });
    }
  }

  async function saveSelectedLeads() {
    if (!selectedRows.length || bulkSaving) return;
    setBulkSaving(true);
    setError('');
    setNotice('');

    let ok = 0;
    let failed = 0;
    for (const company of selectedRows) {
      const created = await saveLead(company, true);
      if (created) ok += 1;
      else failed += 1;
    }

    if (failed) setError(`${ok} lead(s) adicionado(s). ${failed} não puderam ser criados e permanecem selecionados.`);
    else setNotice(`${ok} lead${ok === 1 ? '' : 's'} adicionado${ok === 1 ? '' : 's'} com sucesso.`);
    setBulkSaving(false);
  }

  function exportCsv() {
    const rows = selected.size
      ? results.filter((company) => selected.has(company.id))
      : filteredResults;
    if (!rows.length) {
      setError('Não há empresas para exportar.');
      return;
    }

    const headers = ['Empresa', 'Ramo', 'Endereço', 'Cidade', 'Estado', 'Distância km', 'Telefone', 'E-mail', 'Website', 'Score'];
    const data = rows.map((company) => [
      company.name,
      company.category || '',
      company.address || '',
      company.city || '',
      company.state || '',
      company.distanceKm ?? '',
      company.phone || '',
      company.email || '',
      company.website || '',
      company.score ?? '',
    ]);
    const csv = [headers, ...data].map((row) => row.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prospeccao-${slugify(businessType || 'empresas')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`${rows.length} empresa${rows.length === 1 ? '' : 's'} exportada${rows.length === 1 ? '' : 's'}.`);
  }

  return (
    <>
      <PageTitle
        title="Prospecção"
        subtitle="Encontre empresas reais por segmento e região, qualifique os melhores contatos e envie-os para o funil comercial."
      />

      <section className="card prospecting-search-card">
        <div className="prospecting-section-head">
          <div>
            <span className="eyebrow">Busca geográfica</span>
            <h3>Defina seu mercado-alvo</h3>
            <p className="muted">A busca considera o segmento, a cidade, o raio e a disponibilidade de dados comerciais públicos.</p>
          </div>
          <span className="prospecting-status"><span /> Pesquisa protegida por sessão</span>
        </div>

        <form onSubmit={handleSearch} className="prospecting-search-form">
          <label className="prospecting-segment-field">
            <span>Ramo do negócio</span>
            <input value={businessType} onChange={(event) => setBusinessType(event.target.value)} placeholder="Ex.: clínicas odontológicas, academias, imobiliárias" autoComplete="off" maxLength={90} />
          </label>
          <label>
            <span>Estado</span>
            <select value={state} onChange={(event) => setState(event.target.value)}>
              {BRAZIL_STATES.map(([uf, label]) => <option key={uf} value={uf}>{uf} — {label}</option>)}
            </select>
          </label>
          <label>
            <span>Cidade</span>
            <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex.: Campinas" autoComplete="address-level2" maxLength={80} />
          </label>
          <label>
            <span>Raio</span>
            <select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))}>
              {RADIUS_OPTIONS.map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
            </select>
          </label>
          <label>
            <span>Limite</span>
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              {LIMIT_OPTIONS.map((value) => <option key={value} value={value}>{value} empresas</option>)}
            </select>
          </label>
          <button className="btn primary prospecting-search-button" type="submit" disabled={loading}>
            <Icon name="search" size={16} /> {loading ? 'Buscando empresas…' : 'Buscar empresas'}
          </button>
        </form>
      </section>

      {error && <div className="error prospecting-message">{error}</div>}
      {notice && <div className="notice prospecting-message">{notice}</div>}

      {searched && !error && (
        <>
          <section className="prospecting-metrics">
            <Metric label="Encontradas" value={metrics.total} detail={searchSummary} icon="building" />
            <Metric label="Com contato" value={metrics.withContact} detail={`${percentage(metrics.withContact, metrics.total)}% dos resultados`} icon="users" />
            <Metric label="Com telefone" value={metrics.withPhone} detail={`${metrics.withEmail} com e-mail`} icon="phone" />
            <Metric label="Alta qualidade" value={metrics.highScore} detail="score ≥ 70" icon="target" />
          </section>

          <section className="card prospecting-results-card">
            <div className="prospecting-results-head">
              <div>
                <span className="eyebrow">Resultados</span>
                <h3>{meta?.query || businessType.trim()}</h3>
                <p className="muted">{searchSummary}</p>
              </div>
              <div className="prospecting-head-actions">
                <span className="badge">Raio: {meta?.radiusKm || radiusKm} km</span>
                <button className="btn ghost" type="button" onClick={exportCsv} disabled={!filteredResults.length}>
                  Exportar CSV
                </button>
                <button className="btn primary" type="button" onClick={saveSelectedLeads} disabled={!selectedRows.length || bulkSaving}>
                  <Icon name="plus" size={15} /> {bulkSaving ? 'Adicionando…' : `Adicionar aos Leads${selectedRows.length ? ` (${selectedRows.length})` : ''}`}
                </button>
              </div>
            </div>

            {results.length ? (
              <>
                <div className="prospecting-toolbar">
                  <div className="prospecting-filter-search">
                    <Icon name="search" size={16} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar resultados..." />
                  </div>
                  <select value={contactFilter} onChange={(event) => setContactFilter(event.target.value as ContactFilter)} aria-label="Filtrar por dados disponíveis">
                    <option value="ALL">Todos os resultados</option>
                    <option value="CONTACT">Com algum contato</option>
                    <option value="EMAIL">Com e-mail</option>
                    <option value="PHONE">Com telefone</option>
                    <option value="WEBSITE">Com website</option>
                  </select>
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Ordenar resultados">
                    <option value="SCORE">Melhor qualidade</option>
                    <option value="DISTANCE">Mais próximos</option>
                    <option value="NAME">Nome A–Z</option>
                  </select>
                  <span className="prospecting-filter-count">{filteredResults.length} visíveis</span>
                </div>

                {filteredResults.length ? (
                  <div className="prospecting-table-wrap">
                    <table className="table prospecting-table">
                      <thead>
                        <tr>
                          <th className="prospecting-select-column">
                            <input type="checkbox" aria-label="Selecionar resultados visíveis" checked={filteredResults.filter((row) => !saved.has(row.id)).length > 0 && filteredResults.filter((row) => !saved.has(row.id)).every((row) => selected.has(row.id))} onChange={toggleAllVisible} />
                          </th>
                          <th>Empresa</th>
                          <th>Ramo</th>
                          <th>Distância</th>
                          <th>Contato</th>
                          <th>Qualidade</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResults.map((company) => {
                          const isSaved = saved.has(company.id);
                          const isSaving = saving.has(company.id);
                          return (
                            <tr key={company.id} className={selected.has(company.id) ? 'selected' : ''}>
                              <td className="prospecting-select-column">
                                <input type="checkbox" aria-label={`Selecionar ${company.name}`} checked={selected.has(company.id)} onChange={() => toggleSelected(company.id)} disabled={isSaved} />
                              </td>
                              <td>
                                <button className="prospecting-company-button" type="button" onClick={() => setDetail(company)}>
                                  <span className="prospecting-company-avatar">{initials(company.name)}</span>
                                  <span><strong>{company.name}</strong><small>{compactLocation(company)}</small></span>
                                </button>
                              </td>
                              <td><span className="prospecting-category">{company.category || businessType}</span></td>
                              <td>{formatDistance(company.distanceKm)}</td>
                              <td>
                                <div className="prospecting-contact-stack">
                                  {company.phone && <a href={`tel:${normalizePhone(company.phone)}`}><Icon name="phone" size={13} /> {company.phone}</a>}
                                  {company.email && <a href={`mailto:${company.email}`}><Icon name="mail" size={13} /> {company.email}</a>}
                                  {!company.phone && !company.email && <span className="muted">Sem telefone/e-mail</span>}
                                </div>
                              </td>
                              <td><QualityScore score={company.score || 0} /></td>
                              <td>
                                <div className="prospecting-row-actions">
                                  {company.website && <a href={ensureHttp(company.website)} target="_blank" rel="noreferrer" className="icon-btn" title="Abrir website"><Icon name="arrow-up-right" size={15} /></a>}
                                  <button className={`btn ${isSaved ? 'ghost' : 'primary'} prospecting-lead-button`} type="button" onClick={() => saveLead(company)} disabled={isSaved || isSaving}>
                                    <Icon name={isSaved ? 'check' : 'plus'} size={14} /> {isSaved ? 'Adicionado' : isSaving ? 'Salvando…' : 'Lead'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state prospecting-empty-filter">
                    <Icon name="filter" size={28} />
                    <strong>Nenhum resultado corresponde aos filtros</strong>
                    <span>Limpe a busca ou escolha outro filtro de contato.</span>
                    <button className="btn ghost" onClick={() => { setQuery(''); setContactFilter('ALL'); }}>Limpar filtros</button>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state prospecting-empty-results">
                <Icon name="target" size={30} />
                <strong>Nenhuma empresa encontrada nesse recorte</strong>
                <span>Aumente o raio, ajuste o ramo ou teste uma cidade próxima. Nenhum resultado artificial é inserido.</span>
              </div>
            )}
          </section>
        </>
      )}

      {!searched && (
        <section className="card empty-state prospecting-start-state">
          <Icon name="building" size={32} />
          <strong>Monte sua primeira lista de prospecção</strong>
          <span>Defina segmento, estado, cidade e raio. Os resultados encontrados poderão ser qualificados, exportados ou enviados para Leads.</span>
        </section>
      )}

      {detail && (
        <div className="modalback prospecting-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}>
          <aside className="prospecting-detail-panel" role="dialog" aria-modal="true" aria-label={`Detalhes de ${detail.name}`}>
            <div className="prospecting-detail-head">
              <div className="prospecting-detail-company">
                <span className="prospecting-company-avatar large">{initials(detail.name)}</span>
                <div><span className="eyebrow">Empresa encontrada</span><h3>{detail.name}</h3><p>{detail.category || businessType}</p></div>
              </div>
              <button className="icon-btn" onClick={() => setDetail(null)} aria-label="Fechar"><Icon name="x" /></button>
            </div>

            <div className="prospecting-detail-score"><span>Qualidade dos dados</span><QualityScore score={detail.score || 0} /></div>

            <dl className="prospecting-detail-list">
              <div><dt>Localização</dt><dd>{detail.address || compactLocation(detail)}</dd></div>
              <div><dt>Distância</dt><dd>{formatDistance(detail.distanceKm)}</dd></div>
              <div><dt>Telefone</dt><dd>{detail.phone ? <a href={`tel:${normalizePhone(detail.phone)}`}>{detail.phone}</a> : 'Não encontrado'}</dd></div>
              <div><dt>E-mail</dt><dd>{detail.email ? <a href={`mailto:${detail.email}`}>{detail.email}</a> : 'Não encontrado'}</dd></div>
              <div><dt>Website</dt><dd>{detail.website ? <a href={ensureHttp(detail.website)} target="_blank" rel="noreferrer">{displayWebsite(detail.website)}</a> : 'Não encontrado'}</dd></div>
            </dl>

            <div className="prospecting-detail-actions">
              {detail.website && <a className="btn ghost" href={ensureHttp(detail.website)} target="_blank" rel="noreferrer">Website <Icon name="arrow-up-right" size={14} /></a>}
              {detail.email && <a className="btn ghost" href={`mailto:${detail.email}`}>E-mail</a>}
              {detail.phone && <a className="btn ghost" href={whatsappUrl(detail.phone)} target="_blank" rel="noreferrer">WhatsApp</a>}
              <button className="btn primary" type="button" onClick={() => saveLead(detail)} disabled={saved.has(detail.id) || saving.has(detail.id)}>
                <Icon name={saved.has(detail.id) ? 'check' : 'plus'} size={14} /> {saved.has(detail.id) ? 'Já adicionado' : 'Adicionar aos Leads'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function Metric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: 'building' | 'users' | 'phone' | 'target' }) {
  return <div className="card prospecting-metric"><span className="prospecting-metric-icon"><Icon name={icon} size={18} /></span><div><span>{label}</span><strong>{value.toLocaleString('pt-BR')}</strong><small>{detail}</small></div></div>;
}

function QualityScore({ score }: { score: number }) {
  const tone = score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';
  return <span className={`prospecting-quality ${tone}`}><span>{Math.round(score)}</span><small>/100</small></span>;
}

function normalizeCompanies(payload: any): ProspectCompany[] {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

  const seen = new Set<string>();
  return raw
    .map((item: any, index: number) => ({
      id: String(item?.id || item?.placeId || item?.place_id || `${item?.name || item?.companyName || 'company'}-${index}`),
      name: String(item?.name || item?.companyName || item?.title || '').trim(),
      category: item?.category || item?.industry || item?.businessType || item?.type,
      address: item?.address || item?.formattedAddress || item?.formatted_address,
      city: item?.city || item?.municipality,
      state: item?.state || item?.region || item?.uf,
      distanceKm: toFiniteNumber(item?.distanceKm ?? item?.distance_km ?? item?.distance),
      phone: item?.phone || item?.phoneNumber || item?.formatted_phone_number,
      email: item?.email,
      website: item?.website || item?.site || item?.url,
      lat: toFiniteNumber(item?.lat ?? item?.latitude),
      lon: toFiniteNumber(item?.lon ?? item?.lng ?? item?.longitude),
      score: toFiniteNumber(item?.score) ?? calculateClientScore(item),
    }))
    .filter((item: ProspectCompany) => {
      if (!item.name) return false;
      const key = `${item.name}|${item.phone || ''}|${item.website || ''}|${item.address || ''}`.toLocaleLowerCase('pt-BR');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function calculateClientScore(item: any) {
  let score = 30;
  if (item?.phone || item?.phoneNumber || item?.formatted_phone_number) score += 25;
  if (item?.email) score += 25;
  if (item?.website || item?.site || item?.url) score += 15;
  if (item?.address || item?.formattedAddress || item?.formatted_address) score += 5;
  return score;
}

function buildLeadNote(company: ProspectCompany) {
  const location = compactLocation(company);
  const distance = formatDistance(company.distanceKm);
  return `Lead originado pela Prospecção Klyvero. Segmento: ${company.category || 'não informado'}. Localização: ${location}. Distância da busca: ${distance}. Score dos dados: ${company.score || 0}/100.`;
}

function formatDistance(value?: number) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

function compactLocation(company: ProspectCompany) {
  return [company.city, company.state].filter(Boolean).join(' / ') || company.address || 'Localização não informada';
}

function ensureHttp(value: string) {
  const trimmed = String(value || '').trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function displayWebsite(value: string) {
  return String(value || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function normalizePhone(value: string) {
  return String(value || '').replace(/[^+\d]/g, '');
}

function whatsappUrl(phone: string) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11) digits = `55${digits}`;
  return `https://wa.me/${digits}`;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'E';
}

function percentage(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function csvCell(value: unknown) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'empresas';
}
