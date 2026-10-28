export const TEMPLATE_VARIABLES = ['firstName', 'lastName', 'companyName', 'jobTitle', 'email', 'phone', 'website'] as const;

export type TemplateLead = Partial<Record<(typeof TEMPLATE_VARIABLES)[number], string | null>>;

/** Replaces {{variable}}; unknown or empty values become an empty string. */
export function renderTemplate(template: string, lead: TemplateLead) {
  return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (_match, key: string) => {
    const value = (TEMPLATE_VARIABLES as readonly string[]).includes(key) ? lead[key as keyof TemplateLead] : '';
    return value ?? '';
  });
}

/** Exponential backoff: 60 s, 120 s, 240 s... */
export function retryDelayMs(attempt: number, baseMs = 60_000) {
  return baseMs * 2 ** Math.max(0, attempt - 1);
}
