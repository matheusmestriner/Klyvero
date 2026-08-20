package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/klyvero/whatsapp-service/internal/httpapi"
	"github.com/klyvero/whatsapp-service/internal/session"
)

func main() {
	port := getenv("PORT", "8090")

	if os.Getenv("KLYVERO_SERVICE_DISABLED") == "1" {
		handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Cache-Control", "no-store, max-age=0")
			http.Error(w, "This deployment has been retired.", http.StatusGone)
		})
		server := &http.Server{Addr: ":" + port, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
		log.Printf("retired service listening on :%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
		return
	}

	internalToken := os.Getenv("INTERNAL_TOKEN")
	databaseDir := getenv("DATABASE_DIR", "/app/data")
	eventURL := os.Getenv("EVENT_URL")
	if eventURL == "" {
		if hostport := os.Getenv("EVENT_HOSTPORT"); hostport != "" {
			eventURL = "http://" + hostport + "/api/v1/internal/whatsapp/events"
		}
	}
	if len(internalToken) < 32 {
		log.Fatal("INTERNAL_TOKEN must be at least 32 characters")
	}
	manager, err := session.New(databaseDir, eventURL, internalToken)
	if err != nil {
		log.Fatalf("initialize session manager: %v", err)
	}
	api := httpapi.New(manager, internalToken)
	server := &http.Server{Addr: ":" + port, Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	log.Printf("klyvero whatsapp listening on :%s", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
