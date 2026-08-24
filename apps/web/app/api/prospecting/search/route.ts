import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const UPSTREAM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const UPSTREAM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const MAX_RESULTS = 50;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CLIENT_WINDOW_MS = 60 * 60 * 1000;
const CLIENT_LIMIT = 30;
const UPSTREAM_INTERVAL_MS = 1100;

type SearchBody = {
  query?: string;
  businessType?: string;
  state?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  radiusKm?: number;
  limit?: number;
};

type UpstreamPlace = {
  place_id?: number;
  osm_id?: number;
  osm_type?: string;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  type?: string;
  category?: string;
  class?: string;
  address?: Record<string, string | undefined>;
  extratags?: Record<string, string | undefined>;
  namedetails?: Record<string, string | undefined>;
};

type ReverseResult = {
  address?: Record<string, string | undefined>;
};

type CacheEntry = { expiresAt: number; payload: unknown };
type ClientWindow = { resetAt: number; count: number };

const cache = new Map<string, CacheEntry>();
const clientWindows = new Map<string, ClientWindow>();
let upstreamQueue: Promise<void> = Promise.resolve();
let lastUpstreamAt = 0;

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const sessionValid = await validateSession(auth);
    if (!sessionValid) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const clientKey = getClientKey(request);
    if (!consumeClientQuota(clientKey)) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Muitas buscas em pouco tempo. Aguarde alguns minutos e tente novamente.' },
        { status: 429, headers: { 'Retry-After': '120' } },
      );
    }

    const body = (await request.json()) as SearchBody;
    const segment = clean(body.businessType || body.query || '', 90);
    const requestedCity = clean(body.city || '', 80);
    const requestedState = cleanState(body.state || '');
    const latitude = finiteCoordinate(body.latitude, -90, 90);
    const longitude = finiteCoordinate(body.longitude, -180, 180);
    const hasBrowserLocation = latitude !== null && longitude !== null;
    const accuracyM = clampNumber(body.accuracyM, 0, 50_000, 0);
    const radiusKm = clampNumber(body.radiusKm, 1, 100, 10);
    const limit = Math.round(clampNumber(body.limit, 1, MAX_RESULTS, 30));

    if (segment.length < 2 || (!hasBrowserLocation && (requestedCity.length < 2 || !requestedState))) {
      return NextResponse.json(
        { error: 'invalid_search', message: 'Informe o ramo e uma cidade/estado válidos ou autorize sua localização.' },
        { status: 400 },
      );
    }

    let center: { lat: number; lon: number } | null = null;
    let city = requestedCity;
    let state = requestedState;
    let source: 'browser' | 'manual' = 'manual';

    if (hasBrowserLocation) {
      center = { lat: latitude, lon: longitude };
      source = 'browser';
      const region = await reverseGeocode(latitude, longitude).catch(() => null);
      city = region?.city || requestedCity || 'Sua localização';
      state = region?.state || requestedState;
    } else {
      center = await geocodeCity(requestedCity, requestedState);
    }

    if (!center) {
      return NextResponse.json(
        { error: 'location_not_found', message: 'Não foi possível localizar a região informada.' },
        { status: 404 },
      );
    }

    const locationKey = source === 'browser'
      ? `${center.lat.toFixed(3)}|${center.lon.toFixed(3)}`
      : `${city}|${state}`;
    const cacheKey = `${segment}|${locationKey}|${radiusKm}|${limit}`.toLocaleLowerCase('pt-BR');
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, { headers: responseHeaders('HIT') });
    }

    const searchCity = city === 'Sua localização' ? '' : city;
    const places = await searchBusinesses(segment, searchCity, state, center.lat, center.lon, radiusKm, limit);
    const items = normalizePlaces(places, segment, center.lat, center.lon, radiusKm).slice(0, limit);

    const payload = {
      items,
      meta: {
        query: segment,
        city,
        state,
        source,
        radiusKm,
        total: items.length,
        center,
        accuracyM: source === 'browser' && accuracyM > 0 ? Math.round(accuracyM) : undefined,
        generatedAt: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    pruneMaps();

    return NextResponse.json(payload, { headers: responseHeaders('MISS') });
  } catch (error) {
    console.error('prospecting_search_failed', safeError(error));
    return NextResponse.json(
      { error: 'search_unavailable', message: 'A busca de prospecção está temporariamente indisponível. Tente novamente.' },
      { status: 502 },
    );
  }
}

async function validateSession(authorization: string) {
  try {
    const response = await fetch(`${API_BASE}/branding/me`, {
      method: 'GET',
      headers: { authorization },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function geocodeCity(city: string, state: string) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: `${city}, ${state}, Brasil`,
    countrycodes: 'br',
    addressdetails: '1',
    limit: '1',
  });
  const rows = await upstreamFetch(params);
  const row = rows[0];
  const lat = Number(row?.lat);
  const lon = Number(row?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function reverseGeocode(lat: number, lon: number) {
  await scheduleUpstream();
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: lat.toFixed(6),
    lon: lon.toFixed(6),
    zoom: '10',
    addressdetails: '1',
  });
  const response = await fetch(`${UPSTREAM_REVERSE_URL}?${params.toString()}`, {
    headers: upstreamHeaders(),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`reverse_${response.status}`);
  const payload = (await response.json()) as ReverseResult;
  const address = payload.address || {};
  return {
    city: clean(address.city || address.town || address.municipality || address.village || address.county || '', 100),
    state: extractStateCode(address),
  };
}

async function searchBusinesses(
  segment: string,
  city: string,
  state: string,
  lat: number,
  lon: number,
  radiusKm: number,
  limit: number,
) {
  const latDelta = radiusKm / 111.32;
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const lonDelta = radiusKm / (111.32 * cos);
  const viewbox = [lon - lonDelta, lat + latDelta, lon + lonDelta, lat - latDelta]
    .map((value) => value.toFixed(6))
    .join(',');

  const query = [segment, city, state, 'Brasil'].filter(Boolean).join(', ');
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: query,
    countrycodes: 'br',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    bounded: '1',
    viewbox,
    dedupe: '1',
    limit: String(Math.min(MAX_RESULTS, Math.max(limit * 2, 20))),
  });

  return upstreamFetch(params);
}

async function upstreamFetch(params: URLSearchParams): Promise<UpstreamPlace[]> {
  await scheduleUpstream();
  const response = await fetch(`${UPSTREAM_SEARCH_URL}?${params.toString()}`, {
    headers: upstreamHeaders(),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`upstream_${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function upstreamHeaders() {
  return {
    Accept: 'application/json',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5',
    'User-Agent': 'Klyvero-SalesOS/2.5 prospecting-search',
  };
}

function scheduleUpstream() {
  const job = upstreamQueue.then(async () => {
    const wait = Math.max(0, UPSTREAM_INTERVAL_MS - (Date.now() - lastUpstreamAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastUpstreamAt = Date.now();
  });
  upstreamQueue = job.catch(() => {});
  return job;
}

function normalizePlaces(rows: UpstreamPlace[], segment: string, centerLat: number, centerLon: number, radiusKm: number) {
  const seen = new Set<string>();
  return rows
    .map((row) => {
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      const distanceKm = haversine(centerLat, centerLon, lat, lon);
      if (distanceKm > radiusKm) return null;

      const tags = row.extratags || {};
      const address = row.address || {};
      const name = clean(row.namedetails?.name || row.name || firstDisplayPart(row.display_name) || '', 160);
      if (!name) return null;

      const phone = clean(tags['contact:phone'] || tags.phone || tags['contact:mobile'] || tags.mobile || '', 80);
      const email = clean(tags['contact:email'] || tags.email || '', 160);
      const website = clean(tags['contact:website'] || tags.website || tags.url || '', 300);
      const city = clean(address.city || address.town || address.municipality || address.village || '', 100);
      const state = clean(address.state || address['ISO3166-2-lvl4']?.replace('BR-', '') || '', 100);
      const category = clean(tags.amenity || tags.shop || tags.office || tags.tourism || row.type || row.category || segment, 100);
      const id = `${row.osm_type || 'place'}:${row.osm_id || row.place_id || `${name}:${lat}:${lon}`}`;
      const dedupeKey = `${name}|${phone}|${website}|${lat.toFixed(5)}|${lon.toFixed(5)}`.toLocaleLowerCase('pt-BR');
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);

      return {
        id,
        name,
        category: humanize(category),
        address: clean(row.display_name || '', 500),
        city,
        state,
        distanceKm: Number(distanceKm.toFixed(2)),
        phone,
        email,
        website,
        lat,
        lon,
        score: qualityScore({ phone, email, website, address: row.display_name || '' }),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm || a.name.localeCompare(b.name, 'pt-BR'));
}

function qualityScore(values: { phone: string; email: string; website: string; address: string }) {
  let score = 30;
  if (values.phone) score += 25;
  if (values.email) score += 25;
  if (values.website) score += 15;
  if (values.address) score += 5;
  return Math.min(score, 100);
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function consumeClientQuota(key: string) {
  const now = Date.now();
  const current = clientWindows.get(key);
  if (!current || current.resetAt <= now) {
    clientWindows.set(key, { resetAt: now + CLIENT_WINDOW_MS, count: 1 });
    return true;
  }
  if (current.count >= CLIENT_LIMIT) return false;
  current.count += 1;
  return true;
}

function getClientKey(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const real = request.headers.get('x-real-ip')?.trim();
  return forwarded || real || 'unknown';
}

function pruneMaps() {
  const now = Date.now();
  if (cache.size > 250) {
    for (const [key, value] of cache) if (value.expiresAt <= now) cache.delete(key);
  }
  if (clientWindows.size > 1000) {
    for (const [key, value] of clientWindows) if (value.resetAt <= now) clientWindows.delete(key);
  }
}

function responseHeaders(cacheStatus: string) {
  return {
    'Cache-Control': 'private, no-store',
    'X-Klyvero-Cache': cacheStatus,
  };
}

function clean(value: unknown, maxLength: number) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanState(value: string) {
  const state = clean(value, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : '';
}

function extractStateCode(address: Record<string, string | undefined>) {
  const iso = address['ISO3166-2-lvl4'] || address['ISO3166-2-lvl6'] || '';
  const match = String(iso).toUpperCase().match(/BR-([A-Z]{2})/);
  if (match?.[1]) return match[1];
  return '';
}

function finiteCoordinate(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return null;
  return numeric;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function firstDisplayPart(value?: string) {
  return value?.split(',')[0]?.trim() || '';
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}
