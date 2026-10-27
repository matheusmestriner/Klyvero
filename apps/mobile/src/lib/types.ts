export type Contact = { id: string; firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null };

export type LastMessage = { id: string; direction: 'INBOUND' | 'OUTBOUND'; text?: string | null; subject?: string | null; status: string; createdAt: string };

export type Thread = {
  id: string;
  channel: 'WHATSAPP' | 'EMAIL';
  subject?: string | null;
  externalKey?: string | null;
  lastMessageAt: string | null;
  contact: Contact | null;
  lastMessage: LastMessage | null;
  unread: number;
};

export type Message = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  channel: 'WHATSAPP' | 'EMAIL';
  status: string;
  subject?: string | null;
  text?: string | null;
  createdAt: string;
};

export type Lead = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  status: string;
  source?: string | null;
  score?: number | null;
  notes?: string | null;
  createdAt: string;
};

export type LeadActivity = { id: string; type: string; title: string; body?: string | null; createdAt: string };
export type LeadEnrollment = { id: string; status: string; nextRunAt?: string | null; campaign: { id: string; name: string; status: string } };
export type LeadDetail = Lead & { activities: LeadActivity[]; enrollments: LeadEnrollment[] };

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  allDay: boolean;
  attendeeName?: string | null;
  attendeeEmail?: string | null;
  meetingUrl?: string | null;
  status: string;
};
