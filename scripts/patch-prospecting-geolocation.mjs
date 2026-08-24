import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(process.cwd(), 'apps', 'web', 'app', 'app', 'prospecting', 'page.tsx');
let source = readFileSync(file, 'utf8');

if (source.includes('const [geoPoint, setGeoPoint]')) {
  console.log('Prospecting geolocation already applied.');
  process.exit(0);
}

function replaceOnce(anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`Prospecting geolocation patch failed: ${label}`);
  source = source.replace(anchor, replacement);
}

replaceOnce(
  "  generatedAt?: string;\n};",
  "  generatedAt?: string;\n  source?: 'browser' | 'manual';\n  accuracyM?: number;\n};\n\ntype GeoPoint = { latitude: number; longitude: number; accuracy: number };",
  'search meta',
);

replaceOnce(
  "  const [detail, setDetail] = useState<ProspectCompany | null>(null);",
  "  const [detail, setDetail] = useState<ProspectCompany | null>(null);\n  const [geoPoint, setGeoPoint] = useState<GeoPoint | null>(null);\n  const [locating, setLocating] = useState(false);",
  'geolocation state',
);

replaceOnce(
  "  async function handleSearch(event: FormEvent<HTMLFormElement>) {",
  `  async function requestCurrentLocation() {\n    if (typeof window === 'undefined' || !window.isSecureContext) {\n      setError('A localização do navegador exige uma conexão HTTPS segura.');\n      return;\n    }\n\n    if (!('geolocation' in navigator)) {\n      setError('Este navegador não oferece suporte à localização. Informe cidade e estado manualmente.');\n      return;\n    }\n\n    if ('permissions' in navigator) {\n      try {\n        const permission = await navigator.permissions.query({ name: 'geolocation' });\n        if (permission.state === 'denied') {\n          setGeoPoint(null);\n          setError('A localização está bloqueada para este site. No navegador, abra as permissões do site ao lado do endereço, permita Localização e clique novamente em Usar minha localização.');\n          return;\n        }\n      } catch {\n        // Alguns navegadores não expõem o estado da permissão; o pedido abaixo continua normalmente.\n      }\n    }\n\n    setLocating(true);\n    setError('');\n    setNotice('');\n\n    navigator.geolocation.getCurrentPosition(\n      (position) => {\n        setGeoPoint({\n          latitude: position.coords.latitude,\n          longitude: position.coords.longitude,\n          accuracy: position.coords.accuracy,\n        });\n        setLocating(false);\n        const accuracy = Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null;\n        setNotice(\`Localização autorizada. A próxima busca usará sua posição atual como centro do raio\${accuracy ? \` (precisão aproximada de \${accuracy} m)\` : ''}. As coordenadas não são armazenadas no navegador.\`);\n      },\n      (locationError) => {\n        setGeoPoint(null);\n        setLocating(false);\n        if (locationError.code === locationError.PERMISSION_DENIED) {\n          setError('Permissão de localização negada. Permita Localização nas configurações deste site e tente novamente. Você também pode pesquisar informando cidade e estado.');\n        } else if (locationError.code === locationError.TIMEOUT) {\n          setError('A localização demorou demais para responder. Tente novamente ou informe a região manualmente.');\n        } else {\n          setError('Não foi possível obter sua localização. Verifique se a localização do dispositivo está ativa e tente novamente.');\n        }\n      },\n      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },\n    );\n  }\n\n  async function handleSearch(event: FormEvent<HTMLFormElement>) {`,
  'location request',
);

replaceOnce(
  "    if (targetCity.length < 2) {\n      setError('Informe a cidade da busca.');",
  "    if (!geoPoint && targetCity.length < 2) {\n      setError('Informe a cidade da busca ou use sua localização atual.');",
  'manual location validation',
);

replaceOnce(
  "        city: targetCity,\n        radiusKm,",
  "        city: targetCity,\n        latitude: geoPoint ? Number(geoPoint.latitude.toFixed(5)) : undefined,\n        longitude: geoPoint ? Number(geoPoint.longitude.toFixed(5)) : undefined,\n        accuracyM: geoPoint?.accuracy,\n        radiusKm,",
  'search coordinates',
);

replaceOnce(
  "      setMeta(payload?.meta || null);\n      setSearched(true);\n      window.localStorage.setItem('klyvero.prospecting.last-search', JSON.stringify({ businessType: segment, state, city: targetCity, radiusKm, limit }));",
  "      setMeta(payload?.meta || null);\n      setSearched(true);\n      if (payload?.meta?.source === 'browser') {\n        if (typeof payload.meta.city === 'string' && payload.meta.city && payload.meta.city !== 'Sua localização') setCity(payload.meta.city);\n        if (typeof payload.meta.state === 'string' && /^[A-Z]{2}$/.test(payload.meta.state)) setState(payload.meta.state);\n      }\n      const rememberedCity = payload?.meta?.city && payload.meta.city !== 'Sua localização' ? payload.meta.city : targetCity;\n      const rememberedState = payload?.meta?.state || state;\n      window.localStorage.setItem('klyvero.prospecting.last-search', JSON.stringify({ businessType: segment, state: rememberedState, city: rememberedCity, radiusKm, limit }));",
  'location response metadata',
);

replaceOnce(
  "            <select value={state} onChange={(event) => setState(event.target.value)}>",
  "            <select value={state} onChange={(event) => { setState(event.target.value); setGeoPoint(null); }}>",
  'state manual override',
);

replaceOnce(
  "            <input value={city} onChange={(event) => setCity(event.target.value)} placeholder=\"Ex.: Campinas\" autoComplete=\"address-level2\" maxLength={80} />",
  "            <input value={city} onChange={(event) => { setCity(event.target.value); setGeoPoint(null); }} placeholder=\"Ex.: Campinas\" autoComplete=\"address-level2\" maxLength={80} />",
  'city manual override',
);

replaceOnce(
  "          <button className=\"btn primary prospecting-search-button\" type=\"submit\" disabled={loading}>",
  `          <button className={\`btn ghost prospecting-location-button \${geoPoint ? 'location-active' : ''}\`} type="button" onClick={requestCurrentLocation} disabled={locating || loading}>\n            <Icon name="target" size={16} /> {locating ? 'Localizando…' : geoPoint ? 'Localização pronta' : 'Usar minha localização'}\n          </button>\n          <button className="btn primary prospecting-search-button" type="submit" disabled={loading}>`,
  'location button',
);

replaceOnce(
  "            <p className=\"muted\">A busca considera o segmento, a cidade, o raio e a disponibilidade de dados comerciais públicos.</p>",
  "            <p className=\"muted\">Pesquise por cidade/estado ou autorize sua localização para usar seu ponto atual como centro real do raio selecionado.</p>",
  'location explanation',
);

replaceOnce(
  "          <span>Defina segmento, estado, cidade e raio. Os resultados encontrados poderão ser qualificados, exportados ou enviados para Leads.</span>",
  "          <span>Defina segmento e região manualmente ou use sua localização atual. Os resultados reais poderão ser qualificados, exportados ou enviados para Leads.</span>",
  'empty state explanation',
);

writeFileSync(file, source, 'utf8');
console.log('Applied browser geolocation and regional prospecting search UI.');
