package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"github.com/klyvero/whatsapp-service/internal/session"
	waProto "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type Server struct { manager *session.Manager; token string }
var safeID=regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
func New(m *session.Manager,t string)*Server{return &Server{manager:m,token:t}}
func(s *Server)Handler()http.Handler{m:=http.NewServeMux();m.HandleFunc("GET /health",s.health);m.HandleFunc("POST /v1/sessions/connect",s.auth(s.connect));m.HandleFunc("GET /v1/sessions/{tenantId}/{sessionId}/status",s.auth(s.status));m.HandleFunc("GET /v1/sessions/{tenantId}/{sessionId}/qr",s.auth(s.qr));m.HandleFunc("POST /v1/messages/text",s.auth(s.sendText));return m}
func secretEqual(a,b string)bool{if len(a)==0||len(a)!=len(b){return false};return subtle.ConstantTimeCompare([]byte(a),[]byte(b))==1}
func(s *Server)auth(n http.HandlerFunc)http.HandlerFunc{return func(w http.ResponseWriter,r *http.Request){if !secretEqual(r.Header.Get("x-internal-token"),s.token){write(w,http.StatusUnauthorized,map[string]any{"error":"unauthorized"});return};r.Body=http.MaxBytesReader(w,r.Body,64<<10);n(w,r)}}
func decodeJSON(w http.ResponseWriter,r *http.Request,dst any)bool{dec:=json.NewDecoder(r.Body);dec.DisallowUnknownFields();if err:=dec.Decode(dst);err!=nil{write(w,http.StatusBadRequest,map[string]any{"error":"invalid json"});return false};return true}
func validSession(t,id string)bool{return len(t)>=32&&len(t)<=64&&safeID.MatchString(strings.ReplaceAll(t,"-",""))&&safeID.MatchString(id)}
func(s *Server)health(w http.ResponseWriter,_ *http.Request){write(w,http.StatusOK,map[string]any{"status":"ok","service":"klyvero-whatsapp","timestamp":time.Now().UTC()})}
func(s *Server)connect(w http.ResponseWriter,r *http.Request){var b ConnectRequest;if !decodeJSON(w,r,&b){return};if !validSession(b.TenantID,b.SessionID){write(w,http.StatusBadRequest,map[string]any{"error":"invalid session identity"});return};x,err:=s.manager.Connect(r.Context(),b.TenantID,b.SessionID);if err!=nil{log.Printf("whatsapp connect failed: %v",err);write(w,http.StatusBadGateway,map[string]any{"error":"connection failed"});return};write(w,http.StatusOK,map[string]any{"tenantId":x.TenantID,"sessionId":x.SessionID,"connected":x.Client.IsConnected(),"loggedIn":x.Client.IsLoggedIn()})}
func(s *Server)status(w http.ResponseWriter,r *http.Request){t,id:=r.PathValue("tenantId"),r.PathValue("sessionId");if !validSession(t,id){write(w,http.StatusBadRequest,map[string]any{"error":"invalid session identity"});return};x,ok:=s.manager.Get(t,id);if !ok{write(w,http.StatusNotFound,map[string]any{"error":"session not found"});return};write(w,http.StatusOK,map[string]any{"tenantId":t,"sessionId":id,"connected":x.Client.IsConnected(),"loggedIn":x.Client.IsLoggedIn()})}
func(s *Server)qr(w http.ResponseWriter,r *http.Request){t,id:=r.PathValue("tenantId"),r.PathValue("sessionId");if !validSession(t,id){write(w,http.StatusBadRequest,map[string]any{"error":"invalid session identity"});return};x,ok:=s.manager.Get(t,id);if !ok{write(w,http.StatusNotFound,map[string]any{"error":"session not found"});return};write(w,http.StatusOK,map[string]any{"tenantId":t,"sessionId":id,"qr":x.QR,"loggedIn":x.Client.IsLoggedIn()})}
func(s *Server)sendText(w http.ResponseWriter,r *http.Request){var b SendTextRequest;if !decodeJSON(w,r,&b){return};if !validSession(b.TenantID,b.SessionID)||len(b.Text)==0||len(b.Text)>10000||len(b.To)>32{write(w,http.StatusBadRequest,map[string]any{"error":"invalid message request"});return};x,ok:=s.manager.Get(b.TenantID,b.SessionID);if !ok{write(w,http.StatusNotFound,map[string]any{"error":"session not found"});return};jid,err:=parseJID(b.To);if err!=nil{write(w,http.StatusBadRequest,map[string]any{"error":"invalid destination"});return};resp,err:=x.Client.SendMessage(r.Context(),jid,&waProto.Message{Conversation:&b.Text});if err!=nil{log.Printf("whatsapp send failed: %v",err);write(w,http.StatusBadGateway,map[string]any{"error":"message delivery failed"});return};write(w,http.StatusOK,map[string]any{"id":resp.ID,"timestamp":resp.Timestamp})}
func parseJID(v string)(types.JID,error){v=strings.TrimSpace(v);if strings.Contains(v,"@"){return types.ParseJID(v)};d:=strings.NewReplacer("+",""," ","","-","","(","",")","").Replace(v);if d==""||len(d)>20{return types.JID{},fmt.Errorf("invalid destination")};for _,r:=range d{if r<'0'||r>'9'{return types.JID{},fmt.Errorf("invalid destination")}};return types.NewJID(d,types.DefaultUserServer),nil}
func write(w http.ResponseWriter,status int,v any){w.Header().Set("content-type","application/json");w.Header().Set("cache-control","no-store");w.WriteHeader(status);_=json.NewEncoder(w).Encode(v)}
