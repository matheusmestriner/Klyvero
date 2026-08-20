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

type Session struct{TenantID string;SessionID string;Client *whatsmeow.Client;QR string;container *sqlstore.Container}
type Manager struct{databaseDir string;eventURL string;eventToken string;httpClient *http.Client;mu sync.RWMutex;sessions map[string]*Session}
func New(databaseDir,eventURL,eventToken string)(*Manager,error){if err:=os.MkdirAll(databaseDir,0700);err!=nil{return nil,err};return &Manager{databaseDir:databaseDir,eventURL:eventURL,eventToken:eventToken,httpClient:&http.Client{Timeout:10*time.Second,CheckRedirect:func(_ *http.Request,_ []*http.Request)error{return http.ErrUseLastResponse}},sessions:map[string]*Session{}},nil}
func key(t,s string)string{return t+":"+s}
func(m *Manager)Get(t,s string)(*Session,bool){m.mu.RLock();defer m.mu.RUnlock();v,ok:=m.sessions[key(t,s)];return v,ok}
var safeName=regexp.MustCompile(`[^a-zA-Z0-9_-]+`)
func(m *Manager)dbURL(t,s string)string{name:=safeName.ReplaceAllString(t+"_"+s,"_");return fmt.Sprintf("file:%s?_foreign_keys=on",filepath.Join(m.databaseDir,name+".db"))}
func(m *Manager)Connect(ctx context.Context,t,s string)(*Session,error){if t==""||s==""{return nil,errors.New("tenantId and sessionId required")};if x,ok:=m.Get(t,s);ok{if !x.Client.IsConnected(){if err:=x.Client.Connect();err!=nil{return nil,err}};return x,nil};container,err:=sqlstore.New(ctx,"sqlite3",m.dbURL(t,s),waLog.Stdout("Database","INFO",true));if err!=nil{return nil,fmt.Errorf("store: %w",err)};store,err:=container.GetFirstDevice(ctx);if err!=nil{return nil,err};client:=whatsmeow.NewClient(store,waLog.Stdout("Client","INFO",true));x:=&Session{TenantID:t,SessionID:s,Client:client,container:container};client.AddEventHandler(func(raw any){m.handleEvent(x,raw)});if client.Store.ID==nil{ch,err:=client.GetQRChannel(ctx);if err!=nil{return nil,err};if err=client.Connect();err!=nil{return nil,err};go func(){for e:=range ch{m.mu.Lock();if e.Event=="code"{x.QR=e.Code}else if e.Event=="success"{x.QR=""};m.mu.Unlock()}}()}else if err=client.Connect();err!=nil{return nil,err};m.mu.Lock();m.sessions[key(t,s)]=x;m.mu.Unlock();return x,nil}
func textOf(evt *events.Message)string{if evt.Message==nil{return ""};if t:=evt.Message.GetConversation();t!=""{return t};if e:=evt.Message.GetExtendedTextMessage();e!=nil{return e.GetText()};if i:=evt.Message.GetImageMessage();i!=nil{return i.GetCaption()};if v:=evt.Message.GetVideoMessage();v!=nil{return v.GetCaption()};if d:=evt.Message.GetDocumentMessage();d!=nil{return d.GetCaption()};return ""}
func(m *Manager)handleEvent(s *Session,raw any){if m.eventURL==""{return};switch evt:=raw.(type){case *events.Message:if evt.Info.IsFromMe{return};from:=evt.Info.Sender.ToNonAD().String();if from==""{from=evt.Info.Chat.ToNonAD().String()};m.post(map[string]any{"type":"message","tenantId":s.TenantID,"sessionId":s.SessionID,"id":string(evt.Info.ID),"from":from,"chat":evt.Info.Chat.ToNonAD().String(),"pushName":evt.Info.PushName,"timestamp":evt.Info.Timestamp.UTC().Format(time.RFC3339Nano),"text":textOf(evt)});case *events.Connected:m.post(map[string]any{"type":"connected","tenantId":s.TenantID,"sessionId":s.SessionID});case *events.LoggedOut:m.post(map[string]any{"type":"logged_out","tenantId":s.TenantID,"sessionId":s.SessionID,"reason":evt.Reason.String()})}}
func(m *Manager)post(payload map[string]any){go func(){body,err:=json.Marshal(payload);if err!=nil{return};req,err:=http.NewRequest(http.MethodPost,m.eventURL,bytes.NewReader(body));if err!=nil{return};req.Header.Set("content-type","application/json");req.Header.Set("x-internal-token",m.eventToken);resp,err:=m.httpClient.Do(req);if err!=nil{return};defer resp.Body.Close()}()}
