package httpapi

type ConnectRequest struct { TenantID string `json:"tenantId"`; SessionID string `json:"sessionId"` }
type SendTextRequest struct { TenantID string `json:"tenantId"`; SessionID string `json:"sessionId"`; To string `json:"to"`; Text string `json:"text"` }
