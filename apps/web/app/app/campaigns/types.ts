export type CampaignChannel = 'EMAIL' | 'WHATSAPP' | 'MULTICHANNEL';
export type StepChannel = 'EMAIL' | 'WHATSAPP';
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type EnrollmentStatus = 'ACTIVE' | 'PAUSED' | 'REPLIED' | 'COMPLETED' | 'STOPPED' | 'FAILED';
export type RunStatus = 'QUEUED' | 'RUNNING' | 'SENT' | 'SKIPPED' | 'FAILED' | 'CANCELED';

export type Step = {
  id: string;
  position: number;
  delayMinutes: number;
  channel: StepChannel;
  subject?: string | null;
  body: string;
};

export type CampaignStats = {
  active: number;
  paused: number;
  replied: number;
  completed: number;
  failed: number;
  stopped: number;
  sent: number;
};

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  channel: CampaignChannel;
  description?: string | null;
  emailMailboxId?: string | null;
  emailMailbox?: { id: string; name: string; fromAddress: string } | null;
  steps: Step[];
  stats: CampaignStats;
  _count: { enrollments: number };
};

export type Mailbox = { id: string; name: string; fromAddress: string; active: boolean };

export type LeadRow = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
};

export type Run = {
  id: string;
  status: RunStatus;
  scheduledAt: string;
  finishedAt?: string | null;
  attempts: number;
  error?: string | null;
  step: { id: string; position: number; channel: StepChannel };
};

export type Enrollment = {
  id: string;
  status: EnrollmentStatus;
  currentPosition: number;
  nextRunAt?: string | null;
  repliedAt?: string | null;
  lastError?: string | null;
  lead: LeadRow;
  runs: Run[];
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  ARCHIVED: 'Arquivada',
};

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

export const CHANNEL_LABEL: Record<CampaignChannel, string> = {
  EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp',
  MULTICHANNEL: 'E-mail + WhatsApp',
};

export const ENROLLMENT_LABEL: Record<EnrollmentStatus, string> = {
  ACTIVE: 'Em andamento',
  PAUSED: 'Pausado',
  REPLIED: 'Respondeu',
  COMPLETED: 'Concluído',
  STOPPED: 'Interrompido',
  FAILED: 'Falhou',
};

export const TEMPLATE_VARIABLES: Array<{ key: string; label: string; sample: string }> = [
  { key: 'firstName', label: 'Nome', sample: 'Ana' },
  { key: 'lastName', label: 'Sobrenome', sample: 'Souza' },
  { key: 'companyName', label: 'Empresa', sample: 'Padaria Sol' },
  { key: 'jobTitle', label: 'Cargo', sample: 'Gerente' },
  { key: 'email', label: 'E-mail', sample: 'ana@exemplo.com' },
  { key: 'phone', label: 'Telefone', sample: '(11) 99999-0000' },
  { key: 'website', label: 'Site', sample: 'https://exemplo.com' },
];
