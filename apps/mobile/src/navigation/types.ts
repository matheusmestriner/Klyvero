export type HomeStackParamList = {
  Home: undefined;
};

export type CrmStackParamList = {
  Leads: undefined;
  LeadDetail: { id: string };
  Pipeline: undefined;
  Companies: undefined;
  Contacts: undefined;
  Prospecting: undefined;
};

export type InboxStackParamList = {
  Inbox: undefined;
  Conversation: { threadId: string; label: string; phone?: string };
};

export type AgendaStackParamList = {
  Calendar: undefined;
};

export type MoreStackParamList = {
  More: undefined;
  Analytics: undefined;
  Campaigns: undefined;
  AIAgents: undefined;
  Integrations: undefined;
  WhiteLabel: undefined;
  Team: undefined;
  ApiKeys: undefined;
  Webhooks: undefined;
  Billing: undefined;
  Audit: undefined;
  WhatsAppConnect: undefined;
  Profile: undefined;
};
