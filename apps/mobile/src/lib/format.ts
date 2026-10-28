// Pure helpers shared by the screens. Kept free of React Native imports so node can test them.

export type Named = { firstName?: string | null; lastName?: string | null; companyName?: string | null; email?: string | null; phone?: string | null };

export function personName(person: Named | null | undefined, fallback = 'Sem nome') {
  if (!person) return fallback;
  const full = [person.firstName, person.lastName].map((part) => part?.trim()).filter(Boolean).join(' ');
  return full || person.companyName?.trim() || person.email?.trim() || person.phone?.trim() || fallback;
}

export function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

export const LEAD_STATUS_LABEL: Record<string, string> = {
  NEW: 'Novo',
  CONTACTED: 'Contatado',
  REPLIED: 'Respondeu',
  QUALIFIED: 'Qualificado',
  MEETING: 'Reunião',
  WON: 'Ganho',
  LOST: 'Perdido',
  BLOCKED: 'Bloqueado',
};
export const LEAD_STATUSES = Object.keys(LEAD_STATUS_LABEL);

const pad = (value: number) => String(value).padStart(2, '0');

export function timeLabel(iso: string) {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dayKey(iso: string | Date) {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "agora", "5 min", "3 h", "ontem", "12/03" — what a conversation list shows. */
export function relativeTime(iso: string | null | undefined, now = new Date()) {
  if (!iso) return '';
  const date = new Date(iso);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  if (dayKey(date) === dayKey(now)) return `${Math.floor(minutes / 60)} h`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return 'ontem';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function dayHeading(key: string, now = new Date()) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const prefix = key === dayKey(now) ? 'Hoje' : key === dayKey(tomorrow) ? 'Amanhã' : WEEKDAYS[date.getDay()];
  return `${prefix}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export type Dated = { startsAt: string };
/** Groups events by local day, days ascending, events by start time. */
export function groupByDay<T extends Dated>(events: T[]) {
  const days = new Map<string, T[]>();
  for (const event of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = dayKey(event.startsAt);
    days.set(key, [...(days.get(key) ?? []), event]);
  }
  return [...days].map(([key, items]) => ({ key, items }));
}

/** Digits only, ready for wa.me / tel:. Brazilian numbers without a country code get 55. */
export function dialDigits(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (/^\s*(\+|00)/.test(phone ?? '')) return digits.replace(/^00/, '');
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

/** "2026-03-05" + "14:30" -> ISO string in local time; null when either part is invalid. */
export function parseLocal(date: string, time: string) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  const value = new Date(year, month - 1, day, hour, minute);
  if (value.getMonth() !== month - 1 || value.getDate() !== day || hour > 23 || minute > 59) return null;
  return value.toISOString();
}

export function localParts(iso: string) {
  return { date: dayKey(iso), time: timeLabel(iso) };
}
