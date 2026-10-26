import { TEMPLATE_VARIABLES } from './types';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date);
}

export function leadName(lead: { firstName?: string | null; lastName?: string | null; companyName?: string | null; email?: string | null; phone?: string | null }) {
  const person = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim();
  return person || lead.companyName || lead.email || lead.phone || 'Lead sem nome';
}

const UNITS = [
  { unit: 'days', minutes: 1440, one: 'dia', many: 'dias' },
  { unit: 'hours', minutes: 60, one: 'hora', many: 'horas' },
  { unit: 'minutes', minutes: 1, one: 'minuto', many: 'minutos' },
] as const;

export type DelayUnit = (typeof UNITS)[number]['unit'];

/** 2880 -> { value: 2, unit: 'days' }; picks the largest unit that divides evenly. */
export function splitDelay(minutes: number): { value: number; unit: DelayUnit } {
  if (minutes <= 0) return { value: 0, unit: 'minutes' };
  const found = UNITS.find((entry) => minutes % entry.minutes === 0) ?? UNITS[2];
  return { value: minutes / found.minutes, unit: found.unit };
}

export function toMinutes(value: number, unit: DelayUnit) {
  return Math.round(value * (UNITS.find((entry) => entry.unit === unit)?.minutes ?? 1));
}

export function describeDelay(minutes: number, first: boolean) {
  if (minutes <= 0) return first ? 'Assim que a campanha iniciar' : 'Logo após o passo anterior';
  const { value, unit } = splitDelay(minutes);
  const entry = UNITS.find((item) => item.unit === unit)!;
  return `${first ? 'Após' : 'Depois de'} ${value} ${value === 1 ? entry.one : entry.many}${first ? ' do início' : ''}`;
}

/** Same {{variable}} syntax the server renders, filled with sample data for the preview. */
export function previewTemplate(template: string) {
  return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (_match, key: string) => TEMPLATE_VARIABLES.find((variable) => variable.key === key)?.sample ?? '');
}
