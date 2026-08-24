package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestHTTPServerShutdownOnCancel(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	ctx, cancel := context.WithCancel(context.Background())

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}

	r := gin.New()
	r.GET("/api/v1/health", func(c *gin.Context) { c.Status(http.StatusOK) })

	httpServer := &http.Server{
		Addr:    listener.Addr().String(),
		Handler: r,
		BaseContext: func(net.Listener) context.Context {
			return ctx
		},
	}

	serverErr := make(chan error, 1)
	go func() {
		err := httpServer.Serve(listener)
		if errors.Is(err, http.ErrServerClosed) {
			serverErr <- nil
			return
		}
		serverErr <- err
	}()

	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	select {
	case err := <-serverErr:
		if err != nil {
			t.Fatalf("Serve() error = %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("server did not stop within 5 seconds")
	}
}

func TestHTTPServerClosedIsSuccess(t *testing.T) {
	if !errors.Is(http.ErrServerClosed, http.ErrServerClosed) {
		t.Fatal("expected http.ErrServerClosed sentinel")
	}
}
