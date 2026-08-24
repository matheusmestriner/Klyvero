package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/klyvero/whatsapp-service/internal/session"
	waProto "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
)

type Server struct {
	manager *session.Manager
	token   string
}

var safeID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func New(manager *session.Manager, token string) *Server {
	return &Server{manager: manager, token: token}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("POST /v1/sessions/connect", s.auth(s.connect))
	mux.HandleFunc("GET /v1/sessions/{tenantId}/{sessionId}/status", s.auth(s.status))
	mux.HandleFunc("GET /v1/sessions/{tenantId}/{sessionId}/qr", s.auth(s.qr))
	mux.HandleFunc("POST /v1/messages/text", s.auth(s.sendText))
	return mux
}

func secretEqual(left, right string) bool {
	if len(left) == 0 || len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !secretEqual(r.Header.Get("x-internal-token"), s.token) {
			write(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
		next(w, r)
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, destination any) bool {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		write(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return false
	}
	return true
}

func validSession(tenantID, sessionID string) bool {
	return len(tenantID) >= 32 && len(tenantID) <= 64 &&
		safeID.MatchString(strings.ReplaceAll(tenantID, "-", "")) &&
		safeID.MatchString(sessionID)
}

func pairingPayload(value *session.Session) map[string]any {
	snapshot := value.Snapshot()
	return map[string]any{
		"tenantId":     value.TenantID,
		"sessionId":    value.SessionID,
		"connected":    snapshot.Connected,
		"loggedIn":     snapshot.LoggedIn,
		"qr":           snapshot.QR,
		"pairingState": snapshot.PairingState,
		"qrUpdatedAt":  snapshot.QRUpdatedAt,
	}
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	write(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"service":   "klyvero-whatsapp",
		"timestamp": time.Now().UTC(),
	})
}

func (s *Server) connect(w http.ResponseWriter, r *http.Request) {
	var body ConnectRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if !validSession(body.TenantID, body.SessionID) {
		write(w, http.StatusBadRequest, map[string]any{"error": "invalid session identity"})
		return
	}

	value, err := s.manager.Connect(r.Context(), body.TenantID, body.SessionID)
	if err != nil {
		log.Printf("whatsapp connect failed: %v", err)
		write(w, http.StatusBadGateway, map[string]any{"error": "connection failed"})
		return
	}
	write(w, http.StatusOK, pairingPayload(value))
}

func (s *Server) status(w http.ResponseWriter, r *http.Request) {
	tenantID, sessionID := r.PathValue("tenantId"), r.PathValue("sessionId")
	if !validSession(tenantID, sessionID) {
		write(w, http.StatusBadRequest, map[string]any{"error": "invalid session identity"})
		return
	}
	value, ok := s.manager.Get(tenantID, sessionID)
	if !ok {
		write(w, http.StatusNotFound, map[string]any{"error": "session not found"})
		return
	}
	write(w, http.StatusOK, pairingPayload(value))
}

func (s *Server) qr(w http.ResponseWriter, r *http.Request) {
	tenantID, sessionID := r.PathValue("tenantId"), r.PathValue("sessionId")
	if !validSession(tenantID, sessionID) {
		write(w, http.StatusBadRequest, map[string]any{"error": "invalid session identity"})
		return
	}
	value, ok := s.manager.Get(tenantID, sessionID)
	if !ok {
		write(w, http.StatusNotFound, map[string]any{"error": "session not found"})
		return
	}
	write(w, http.StatusOK, pairingPayload(value))
}

func (s *Server) sendText(w http.ResponseWriter, r *http.Request) {
	var body SendTextRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if !validSession(body.TenantID, body.SessionID) || len(body.Text) == 0 || len(body.Text) > 10000 || len(body.To) > 32 {
		write(w, http.StatusBadRequest, map[string]any{"error": "invalid message request"})
		return
	}
	value, ok := s.manager.Get(body.TenantID, body.SessionID)
	if !ok {
		write(w, http.StatusNotFound, map[string]any{"error": "session not found"})
		return
	}
	jid, err := parseJID(body.To)
	if err != nil {
		write(w, http.StatusBadRequest, map[string]any{"error": "invalid destination"})
		return
	}
	response, err := value.Client.SendMessage(r.Context(), jid, &waProto.Message{Conversation: &body.Text})
	if err != nil {
		log.Printf("whatsapp send failed: %v", err)
		write(w, http.StatusBadGateway, map[string]any{"error": "message delivery failed"})
		return
	}
	write(w, http.StatusOK, map[string]any{"id": response.ID, "timestamp": response.Timestamp})
}

func parseJID(value string) (types.JID, error) {
	value = strings.TrimSpace(value)
	if strings.Contains(value, "@") {
		return types.ParseJID(value)
	}
	digits := strings.NewReplacer("+", "", " ", "", "-", "", "(", "", ")", "").Replace(value)
	if digits == "" || len(digits) > 20 {
		return types.JID{}, fmt.Errorf("invalid destination")
	}
	for _, char := range digits {
		if char < '0' || char > '9' {
			return types.JID{}, fmt.Errorf("invalid destination")
		}
	}
	return types.NewJID(digits, types.DefaultUserServer), nil
}

func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json")
	w.Header().Set("cache-control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
