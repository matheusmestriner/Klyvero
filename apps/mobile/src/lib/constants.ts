// The API's WhatsApp session id is a client-chosen string (see
// WhatsappConnectDto) -- most tenants only run one connected number, so the
// app standardizes on a single session per tenant instead of building a
// session picker. WhatsAppConnectScreen and ConversationScreen both use it.
export const WHATSAPP_SESSION_ID = 'principal';
