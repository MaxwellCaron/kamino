package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// fakeAccessSessionValidator is a minimal, configurable accessSessionValidator.
type fakeAccessSessionValidator struct {
	err error
}

func (f *fakeAccessSessionValidator) ValidateAccessSession(_ context.Context, _ uuid.UUID, _ uuid.UUID) error {
	return f.err
}

func newAuthTestEngine(t *testing.T, validator accessSessionValidator) (*gin.Engine, *auth.Service, *bool) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	authService, err := auth.NewService("test-secret-at-least-32-characters-long")
	if err != nil {
		t.Fatalf("auth.NewService: %v", err)
	}

	handlerReached := false
	r := gin.New()
	r.Use(Auth(authService, validator))
	r.GET("/protected", func(c *gin.Context) {
		handlerReached = true
		sessionID, ok := c.Get("sessionID")
		if !ok {
			t.Error("expected sessionID in gin context")
			return
		}
		if _, ok := sessionID.(uuid.UUID); !ok {
			t.Errorf("expected sessionID to be uuid.UUID, got %T", sessionID)
		}
		c.Status(http.StatusOK)
	})
	return r, authService, &handlerReached
}

func TestAuth_ValidSession_SetsSessionIDAndReachesHandler(t *testing.T) {
	principalID := uuid.New()
	sessionID := uuid.New()
	r, authService, handlerReached := newAuthTestEngine(t, &fakeAccessSessionValidator{})

	token, _, err := authService.GenerateAccessToken(principalID, sessionID, "alice")
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.AddCookie(&http.Cookie{Name: auth.AccessCookieName, Value: token})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !*handlerReached {
		t.Fatal("expected handler to be reached for a valid session")
	}
}

func TestAuth_InvalidSession_NeverReachesHandler(t *testing.T) {
	principalID := uuid.New()
	sessionID := uuid.New()
	r, authService, handlerReached := newAuthTestEngine(t, &fakeAccessSessionValidator{err: auth.ErrInvalidSession})

	token, _, err := authService.GenerateAccessToken(principalID, sessionID, "alice")
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.AddCookie(&http.Cookie{Name: auth.AccessCookieName, Value: token})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
	if *handlerReached {
		t.Fatal("expected handler to never be reached for an invalid session")
	}
}
