'use client';

import { FormEvent, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { Icon } from '../../../components/icon';
import { PageTitle } from '../../../components/resource-page';

type ProspectCompany = {
  id?: string;
  name: string;
  category?: string;
  address?: string;
  city?: string;
  state?: string;
  distanceKm?: number | string;
  phone?: string;
  email?: string;
  website?: string;
};

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

export default function ProspectingPage() {
  const [businessType, setBusinessType] = useState('');
  const [state, setState] = useState('SP');
  const [city, setCity] = useState('');
  const [radiusKm, setRadiusKm] = useState(10);
  const [results, setResults] = useState<ProspectCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const searchSummary = useMemo(() => {
    if (!searched) return '';
    const location = [city, state].filter(Boolean).join(' / ');
    return `${results.length} empresa${results.length === 1 ? '' : 's'} encontrada${results.length === 1 ? '' : 's'} em até ${radiusKm} km de ${location || 'sua região'}.`;
  }, [city, radiusKm, results.length, searched, state]);

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
    setSearched(false);

    try {
      const payload = await api('/prospecting/search', {
        method: 'POST',
        body: JSON.stringify({
          query: segment,
          businessType: segment,
          industry: segment,
          country: 'BR',
          state,
          city: targetCity,
          radiusKm,
          limit: 100,
        }),
      });

      const rows = normalizeCompanies(payload);
      setResults(rows);
      setSearched(true);
    } catch (err: any) {
      setResults([]);
      setSearched(true);
      setError(
        err?.message ||
          'Não foi possível consultar empresas agora. Verifique a integração de dados da prospecção e tente novamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageTitle
        title="Prospecção geográfica"
        subtitle="Encontre empresas por ramo de atividade e localização para montar sua lista comercial."
      />

      <section className="card spaced-lg">
        <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
          <span className="eyebrow">Busca de empresas</span>
          <h3 style={{ margin: 0 }}>Defina o perfil e a área da prospecção</h3>
          <p className="muted" style={{ margin: 0 }}>
            Pesquise um segmento em uma cidade e limite os resultados pelo raio em quilômetros.
          </p>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,2fr) minmax(120px,.8fr) minmax(180px,1.3fr) minmax(130px,.8fr) auto', gap: 12, alignItems: 'end' }}>
          <label>
            <span>Ramo do negócio</span>
            <input
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value)}
              placeholder="Ex.: clínicas odontológicas, academias, imobiliárias"
              autoComplete="off"
            />
          </label>

          <label>
            <span>Estado</span>
            <select value={state} onChange={(event) => setState(event.target.value)}>
              {BRAZIL_STATES.map(([uf, label]) => (
                <option key={uf} value={uf}>{uf} — {label}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Cidade</span>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Ex.: Campinas"
              autoComplete="address-level2"
            />
          </label>

          <label>
            <span>Raio</span>
            <select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))}>
              {RADIUS_OPTIONS.map((radius) => (
                <option key={radius} value={radius}>{radius} km</option>
              ))}
            </select>
          </label>

          <button className="btn primary" type="submit" disabled={loading} style={{ minHeight: 42 }}>
            <Icon name="search" size={16} /> {loading ? 'Buscando…' : 'Buscar empresas'}
          </button>
        </form>
      </section>

      {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}

      {searched && !error && (
        <section className="card spaced-lg" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <span className="eyebrow">Resultados</span>
              <h3 style={{ margin: '4px 0 0' }}>{businessType.trim()}</h3>
              <p className="muted" style={{ margin: '5px 0 0' }}>{searchSummary}</p>
            </div>
            <span className="badge">Raio: {radiusKm} km</span>
          </div>

          {results.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Ramo</th>
                    <th>Localização</th>
                    <th>Distância</th>
                    <th>Contato</th>
                    <th>Site</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((company, index) => (
                    <tr key={company.id || `${company.name}-${index}`}>
                      <td><strong>{company.name}</strong></td>
                      <td>{company.category || businessType}</td>
                      <td>{company.address || [company.city, company.state].filter(Boolean).join(' / ') || '—'}</td>
                      <td>{formatDistance(company.distanceKm)}</td>
                      <td>
                        <div style={{ display: 'grid', gap: 3 }}>
                          {company.phone && <span><Icon name="phone" size={13} /> {company.phone}</span>}
                          {company.email && <span><Icon name="mail" size={13} /> {company.email}</span>}
                          {!company.phone && !company.email && <span className="muted">—</span>}
                        </div>
                      </td>
                      <td>
                        {company.website ? (
                          <a href={ensureHttp(company.website)} target="_blank" rel="noreferrer" className="btn ghost">
                            Abrir <Icon name="arrow-up-right" size={13} />
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <Icon name="target" size={30} />
              <strong>Nenhuma empresa encontrada</strong>
              <span>Tente aumentar o raio, ajustar o ramo ou pesquisar uma cidade próxima.</span>
            </div>
          )}
        </section>
      )}

      {!searched && (
        <section className="card empty-state" style={{ marginTop: 16 }}>
          <Icon name="building" size={32} />
          <strong>Comece definindo sua região de prospecção</strong>
          <span>Exemplo: “restaurantes”, São Paulo, Campinas, raio de 20 km.</span>
        </section>
      )}
    </>
  );
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

  return raw
    .map((item: any) => ({
      id: item?.id || item?.placeId || item?.place_id,
      name: String(item?.name || item?.companyName || item?.title || '').trim(),
      category: item?.category || item?.industry || item?.businessType || item?.type,
      address: item?.address || item?.formattedAddress || item?.formatted_address,
      city: item?.city || item?.municipality,
      state: item?.state || item?.region || item?.uf,
      distanceKm: item?.distanceKm ?? item?.distance_km ?? item?.distance,
      phone: item?.phone || item?.phoneNumber || item?.formatted_phone_number,
      email: item?.email,
      website: item?.website || item?.site || item?.url,
    }))
    .filter((item: ProspectCompany) => item.name.length > 0);
}

function formatDistance(value: ProspectCompany['distanceKm']) {
  if (value === undefined || value === null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${number.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

function ensureHttp(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
