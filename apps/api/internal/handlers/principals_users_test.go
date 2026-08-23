package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// fakePrincipalsProvider embeds the (nil) principals.Provider interface so only the methods used here need implementations.
type fakePrincipalsProvider struct {
	principals.Provider

	setPasswordErr   error
	setPasswordCalls []struct {
		id       uuid.UUID
		password string
	}

	changePasswordErr   error
	changePasswordCalls []struct {
		id          uuid.UUID
		oldPassword string
		newPassword string
	}
}

func (f *fakePrincipalsProvider) SetPassword(_ context.Context, id uuid.UUID, password string) error {
	f.setPasswordCalls = append(f.setPasswordCalls, struct {
		id       uuid.UUID
		password string
	}{id, password})
	return f.setPasswordErr
}

func (f *fakePrincipalsProvider) ChangePassword(_ context.Context, id uuid.UUID, oldPassword, newPassword string) error {
	f.changePasswordCalls = append(f.changePasswordCalls, struct {
		id          uuid.UUID
		oldPassword string
		newPassword string
	}{id, oldPassword, newPassword})
	return f.changePasswordErr
}

var _ principals.Provider = (*fakePrincipalsProvider)(nil)

type fakePrincipalsAuthz struct {
	requireErr error
}

func (f *fakePrincipalsAuthz) RequireManagement(_ context.Context, _ uuid.UUID, _ authorization.ManagementPermission) error {
	return f.requireErr
}

var _ principalsAuthz = (*fakePrincipalsAuthz)(nil)

type fakePrincipalsAudit struct {
	successes       []audit.EventParams
	failures        []audit.EventParams
	failureMessages []string
}

func (f *fakePrincipalsAudit) RecordSuccess(_ context.Context, params audit.EventParams) {
	f.successes = append(f.successes, params)
}

func (f *fakePrincipalsAudit) RecordFailure(_ context.Context, params audit.EventParams, errMsg string) {
	f.failures = append(f.failures, params)
	f.failureMessages = append(f.failureMessages, errMsg)
}

var _ principalsAudit = (*fakePrincipalsAudit)(nil)

type fakeSessionRevoker struct {
	revokeErr  error
	revokedIDs []uuid.UUID
}

func (f *fakeSessionRevoker) RevokePrincipalSessions(_ context.Context, id uuid.UUID) error {
	f.revokedIDs = append(f.revokedIDs, id)
	return f.revokeErr
}

var _ principalSessionRevoker = (*fakeSessionRevoker)(nil)

func setupPrincipalsPasswordTestRouter(handler *PrincipalsHandler, actorID uuid.UUID) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("userID", actorID)
		c.Next()
	})
	r.POST("/api/v1/principals/users/:id/password", handler.SetPassword)
	r.POST("/api/v1/principals/self/password", handler.ChangeOwnPassword)
	return r
}

func TestSetPasswordProviderFailureDoesNotRevokeSessions(t *testing.T) {
	actorID := uuid.New()
	targetID := uuid.New()
	provider := &fakePrincipalsProvider{setPasswordErr: principals.ErrUnsupportedPrincipal}
	sessions := &fakeSessionRevoker{}
	handler := &PrincipalsHandler{
		Provider: provider,
		Authz:    &fakePrincipalsAuthz{},
		Audit:    &fakePrincipalsAudit{},
		Sessions: sessions,
	}
	router := setupPrincipalsPasswordTestRouter(handler, actorID)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/principals/users/"+targetID.String()+"/password", strings.NewReader(`{"password":"new-password"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unsupported principal, got %d", w.Code)
	}
	if len(sessions.revokedIDs) != 0 {
		t.Fatalf("expected no session revocation after a provider failure, got %v", sessions.revokedIDs)
	}
}

func TestSetPasswordSuccessRevokesTargetBeforeReportingSuccess(t *testing.T) {
	actorID := uuid.New()
	targetID := uuid.New()
	provider := &fakePrincipalsProvider{}
	sessions := &fakeSessionRevoker{}
	auditFake := &fakePrincipalsAudit{}
	handler := &PrincipalsHandler{
		Provider: provider,
		Authz:    &fakePrincipalsAuthz{},
		Audit:    auditFake,
		Sessions: sessions,
	}
	router := setupPrincipalsPasswordTestRouter(handler, actorID)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/principals/users/"+targetID.String()+"/password", strings.NewReader(`{"password":"new-password"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if len(sessions.revokedIDs) != 1 || sessions.revokedIDs[0] != targetID {
		t.Fatalf("expected the target principal's sessions to be revoked, got %v", sessions.revokedIDs)
	}
	if len(auditFake.successes) != 1 {
		t.Fatalf("expected one success audit event, got %d", len(auditFake.successes))
	}
	if len(auditFake.failures) != 0 {
		t.Fatalf("expected no failure audit events, got %d", len(auditFake.failures))
	}
}

func TestSetPasswordRevocationFailureReturnsPartialSuccessError(t *testing.T) {
	actorID := uuid.New()
	targetID := uuid.New()
	provider := &fakePrincipalsProvider{}
	sessions := &fakeSessionRevoker{revokeErr: context.DeadlineExceeded}
	auditFake := &fakePrincipalsAudit{}
	handler := &PrincipalsHandler{
		Provider: provider,
		Authz:    &fakePrincipalsAuthz{},
		Audit:    auditFake,
		Sessions: sessions,
	}
	router := setupPrincipalsPasswordTestRouter(handler, actorID)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/principals/users/"+targetID.String()+"/password", strings.NewReader(`{"password":"new-password"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 on revocation failure, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "password changed but active sessions could not be revoked") {
		t.Fatalf("expected an explicit partial-success message, got %q", w.Body.String())
	}
	if len(auditFake.failures) != 1 {
		t.Fatalf("expected one failure audit event, got %d", len(auditFake.failures))
	}
	if len(auditFake.successes) != 0 {
		t.Fatalf("expected no success audit event when revocation fails, got %d", len(auditFake.successes))
	}
}

func TestChangeOwnPasswordSuccessRevokesCurrentPrincipalAndExpiresCookies(t *testing.T) {
	actorID := uuid.New()
	provider := &fakePrincipalsProvider{}
	sessions := &fakeSessionRevoker{}
	auditFake := &fakePrincipalsAudit{}
	handler := &PrincipalsHandler{
		Provider:     provider,
		Authz:        &fakePrincipalsAuthz{},
		Audit:        auditFake,
		Sessions:     sessions,
		CookieSecure: true,
	}
	router := setupPrincipalsPasswordTestRouter(handler, actorID)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/principals/self/password", strings.NewReader(`{"current_password":"old","new_password":"new-password"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if len(sessions.revokedIDs) != 1 || sessions.revokedIDs[0] != actorID {
		t.Fatalf("expected the current principal's sessions to be revoked, got %v", sessions.revokedIDs)
	}

	cookies := w.Result().Cookies()
	var sawAccess, sawRefresh bool
	for _, cookie := range cookies {
		if cookie.Name == auth.AccessCookieName {
			sawAccess = true
			if cookie.MaxAge >= 0 {
				t.Errorf("expected the access cookie to be expired, got MaxAge=%d", cookie.MaxAge)
			}
		}
		if cookie.Name == auth.RefreshCookieName {
			sawRefresh = true
			if cookie.MaxAge >= 0 {
				t.Errorf("expected the refresh cookie to be expired, got MaxAge=%d", cookie.MaxAge)
			}
		}
	}
	if !sawAccess || !sawRefresh {
		t.Fatalf("expected both auth cookies to be cleared, got %v", cookies)
	}
	if len(auditFake.successes) != 1 {
		t.Fatalf("expected one success audit event, got %d", len(auditFake.successes))
	}
}

func TestChangeOwnPasswordRevocationFailureReturnsPartialSuccessError(t *testing.T) {
	actorID := uuid.New()
	provider := &fakePrincipalsProvider{}
	sessions := &fakeSessionRevoker{revokeErr: context.DeadlineExceeded}
	auditFake := &fakePrincipalsAudit{}
	handler := &PrincipalsHandler{
		Provider: provider,
		Authz:    &fakePrincipalsAuthz{},
		Audit:    auditFake,
		Sessions: sessions,
	}
	router := setupPrincipalsPasswordTestRouter(handler, actorID)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/principals/self/password", strings.NewReader(`{"current_password":"old","new_password":"new-password"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 on revocation failure, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "password changed but active sessions could not be revoked") {
		t.Fatalf("expected an explicit partial-success message, got %q", w.Body.String())
	}
	if len(auditFake.failures) != 1 {
		t.Fatalf("expected one failure audit event, got %d", len(auditFake.failures))
	}
}
