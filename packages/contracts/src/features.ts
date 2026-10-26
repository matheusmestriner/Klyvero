export const KLYVERO_FEATURES = [
  'dashboard',
  'prospecting',
  'leads',
  'companies',
  'contacts',
  'crm',
  'campaigns',
  'email',
  'whatsapp',
  'ai_agents',
  'calendar',
  'analytics',
  'integrations',
  'users',
  'white_label',
  'billing',
] as const;

export type KlyveroFeature = (typeof KLYVERO_FEATURES)[number];
