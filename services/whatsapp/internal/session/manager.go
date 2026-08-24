package session

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

type Snapshot struct {
	QR           string
	PairingState string
	QRUpdatedAt  string
	Connected    bool
	LoggedIn     bool
}

type Session struct {
	TenantID  string
	SessionID string
	Client    *whatsmeow.Client
	container *sqlstore.Container

	mu            sync.RWMutex
	qr            string
	pairingState  string
	qrUpdatedAt   time.Time
	pairingActive bool
	pairingCancel context.CancelFunc
}

type Manager struct {
	databaseDir string
	eventURL    string
	eventToken  string
	httpClient  *http.Client

	mu        sync.RWMutex
	connectMu sync.Mutex
	sessions  map[string]*Session
}

func New(databaseDir, eventURL, eventToken string) (*Manager, error) {
	if err := os.MkdirAll(databaseDir, 0700); err != nil {
		return nil, err
	}
	return &Manager{
		databaseDir: databaseDir,
		eventURL:    eventURL,
		eventToken:  eventToken,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		sessions: map[string]*Session{},
	}, nil
}

func key(tenantID, sessionID string) string {
	return tenantID + ":" + sessionID
}

func (m *Manager) Get(tenantID, sessionID string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	value, ok := m.sessions[key(tenantID, sessionID)]
	return value, ok
}

func (m *Manager) put(value *Session) {
	m.mu.Lock()
	m.sessions[key(value.TenantID, value.SessionID)] = value
	m.mu.Unlock()
}

func (m *Manager) remove(tenantID, sessionID string) {
	m.mu.Lock()
	delete(m.sessions, key(tenantID, sessionID))
	m.mu.Unlock()
}

func (s *Session) Snapshot() Snapshot {
	s.mu.RLock()
	qr := s.qr
	state := s.pairingState
	updatedAt := s.qrUpdatedAt
	s.mu.RUnlock()

	updated := ""
	if !updatedAt.IsZero() {
		updated = updatedAt.UTC().Format(time.RFC3339Nano)
	}

	return Snapshot{
		QR:           qr,
		PairingState: state,
		QRUpdatedAt:  updated,
		Connected:    s.Client.IsConnected(),
		LoggedIn:     s.Client.IsLoggedIn(),
	}
}

func (s *Session) setQR(code, state string) {
	s.mu.Lock()
	s.qr = code
	s.pairingState = state
	s.qrUpdatedAt = time.Now().UTC()
	s.mu.Unlock()
}

func (s *Session) setState(state string, clearQR bool) {
	s.mu.Lock()
	if clearQR {
		s.qr = ""
	}
	s.pairingState = state
	s.qrUpdatedAt = time.Now().UTC()
	s.mu.Unlock()
}

var safeName = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

func (m *Manager) dbURL(tenantID, sessionID string) string {
	name := safeName.ReplaceAllString(tenantID+"_"+sessionID, "_")
	return fmt.Sprintf(
		"file:%s?_foreign_keys=on&_busy_timeout=15000&_journal_mode=WAL&_synchronous=NORMAL",
		filepath.Join(m.databaseDir, name+".db"),
	)
}

// Connect creates or restores a whatsmeow client. Pairing deliberately uses a
// service-owned context rather than the incoming HTTP request context: a QR
// session must remain alive after POST /connect has returned to the browser.
func (m *Manager) Connect(ctx context.Context, tenantID, sessionID string) (*Session, error) {
	if tenantID == "" || sessionID == "" {
		return nil, errors.New("tenantId and sessionId required")
	}

	// Serializing creation avoids duplicate whatsmeow clients and SQLite stores
	// when the UI retries connect while a QR code is being prepared.
	m.connectMu.Lock()
	defer m.connectMu.Unlock()

	if existing, ok := m.Get(tenantID, sessionID); ok {
		if existing.Client.IsLoggedIn() {
			if !existing.Client.IsConnected() {
				if err := existing.Client.Connect(); err != nil {
					return nil, err
				}
			}
			existing.setState("connected", true)
			return existing, nil
		}

		if existing.Client.Store.ID == nil {
			if err := m.ensurePairing(existing); err != nil {
				return nil, err
			}
			return existing, nil
		}

		if !existing.Client.IsConnected() {
			if err := existing.Client.Connect(); err != nil {
				return nil, err
			}
		}
		existing.setState("reconnecting", false)
		return existing, nil
	}

	container, err := sqlstore.New(ctx, "sqlite3", m.dbURL(tenantID, sessionID), waLog.Stdout("Database", "INFO", true))
	if err != nil {
		return nil, fmt.Errorf("store: %w", err)
	}
	store, err := container.GetFirstDevice(ctx)
	if err != nil {
		return nil, err
	}

	client := whatsmeow.NewClient(store, waLog.Stdout("Client", "INFO", true))
	value := &Session{
		TenantID:     tenantID,
		SessionID:    sessionID,
		Client:       client,
		container:    container,
		pairingState: "initializing",
	}
	client.AddEventHandler(func(raw any) { m.handleEvent(value, raw) })

	// Publish the session before connecting. QR/status polling can therefore
	// never race with the session being added to the manager map.
	m.put(value)

	if client.Store.ID == nil {
		if err := m.ensurePairing(value); err != nil {
			m.remove(tenantID, sessionID)
			return nil, err
		}
	} else {
		if err := client.Connect(); err != nil {
			m.remove(tenantID, sessionID)
			return nil, err
		}
		value.setState("reconnecting", false)
	}

	return value, nil
}

func (m *Manager) ensurePairing(value *Session) error {
	value.mu.Lock()
	if value.pairingActive {
		value.mu.Unlock()
		if !value.Client.IsConnected() {
			return value.Client.Connect()
		}
		return nil
	}

	pairingContext, cancel := context.WithCancel(context.Background())
	value.pairingActive = true
	value.pairingCancel = cancel
	value.pairingState = "starting"
	value.mu.Unlock()

	channel, err := value.Client.GetQRChannel(pairingContext)
	if err != nil {
		cancel()
		value.mu.Lock()
		value.pairingActive = false
		value.pairingCancel = nil
		value.pairingState = "error"
		value.mu.Unlock()
		return err
	}

	go m.consumeQR(value, channel, cancel)

	if !value.Client.IsConnected() {
		if err := value.Client.Connect(); err != nil {
			cancel()
			value.setState("error", true)
			return err
		}
	}
	return nil
}

func (m *Manager) consumeQR(value *Session, channel <-chan whatsmeow.QRChannelItem, cancel context.CancelFunc) {
	defer func() {
		cancel()
		value.mu.Lock()
		value.pairingActive = false
		value.pairingCancel = nil
		if value.pairingState == "starting" || value.pairingState == "waiting_for_scan" {
			value.pairingState = "expired"
			value.qr = ""
			value.qrUpdatedAt = time.Now().UTC()
		}
		value.mu.Unlock()
	}()

	for item := range channel {
		switch item.Event {
		case "code":
			value.setQR(item.Code, "waiting_for_scan")
		case "success":
			value.setState("paired", true)
		case "timeout":
			value.setState("expired", true)
		case "error":
			value.setState("error", true)
		default:
			if item.Event != "" {
				value.setState(item.Event, false)
			}
		}
	}
}

func textOf(evt *events.Message) string {
	if evt.Message == nil {
		return ""
	}
	if text := evt.Message.GetConversation(); text != "" {
		return text
	}
	if extended := evt.Message.GetExtendedTextMessage(); extended != nil {
		return extended.GetText()
	}
	if image := evt.Message.GetImageMessage(); image != nil {
		return image.GetCaption()
	}
	if video := evt.Message.GetVideoMessage(); video != nil {
		return video.GetCaption()
	}
	if document := evt.Message.GetDocumentMessage(); document != nil {
		return document.GetCaption()
	}
	return ""
}

func (m *Manager) handleEvent(value *Session, raw any) {
	switch evt := raw.(type) {
	case *events.Message:
		if evt.Info.IsFromMe {
			return
		}
		from := evt.Info.Sender.ToNonAD().String()
		if from == "" {
			from = evt.Info.Chat.ToNonAD().String()
		}
		m.post(map[string]any{
			"type":      "message",
			"tenantId":  value.TenantID,
			"sessionId": value.SessionID,
			"id":        string(evt.Info.ID),
			"from":      from,
			"chat":      evt.Info.Chat.ToNonAD().String(),
			"pushName":  evt.Info.PushName,
			"timestamp": evt.Info.Timestamp.UTC().Format(time.RFC3339Nano),
			"text":      textOf(evt),
		})
	case *events.Connected:
		value.setState("connected", true)
		m.post(map[string]any{"type": "connected", "tenantId": value.TenantID, "sessionId": value.SessionID})
	case *events.LoggedOut:
		value.setState("logged_out", true)
		m.post(map[string]any{
			"type":      "logged_out",
			"tenantId":  value.TenantID,
			"sessionId": value.SessionID,
			"reason":    evt.Reason.String(),
		})
	}
}

func (m *Manager) post(payload map[string]any) {
	if m.eventURL == "" {
		return
	}
	go func() {
		body, err := json.Marshal(payload)
		if err != nil {
			return
		}
		req, err := http.NewRequest(http.MethodPost, m.eventURL, bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("content-type", "application/json")
		req.Header.Set("x-internal-token", m.eventToken)
		resp, err := m.httpClient.Do(req)
		if err != nil {
			return
		}
		defer resp.Body.Close()
	}()
}
