package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestValidateAccessSessionActive(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	sessionID := uuid.New()
	principalID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          sessionID,
		principalID: principalID,
		tokenHash:   hashOpaqueToken("active-token"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	if err := mgr.ValidateAccessSession(context.Background(), sessionID, principalID); err != nil {
		t.Fatalf("ValidateAccessSession (active): unexpected error: %v", err)
	}
}

func TestValidateAccessSessionRevoked(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	sessionID := uuid.New()
	principalID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          sessionID,
		principalID: principalID,
		tokenHash:   hashOpaqueToken("revoked-token"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
		revokedAt:   pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})

	err := mgr.ValidateAccessSession(context.Background(), sessionID, principalID)
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("ValidateAccessSession (revoked): expected ErrInvalidSession, got %v", err)
	}
}

func TestValidateAccessSessionExpired(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	sessionID := uuid.New()
	principalID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          sessionID,
		principalID: principalID,
		tokenHash:   hashOpaqueToken("expired-token"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Hour), Valid: true},
	})

	err := mgr.ValidateAccessSession(context.Background(), sessionID, principalID)
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("ValidateAccessSession (expired): expected ErrInvalidSession, got %v", err)
	}
}

func TestValidateAccessSessionWrongPrincipal(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	sessionID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          sessionID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("wrong-principal-token"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	err := mgr.ValidateAccessSession(context.Background(), sessionID, uuid.New())
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("ValidateAccessSession (wrong principal): expected ErrInvalidSession, got %v", err)
	}
}

func TestRevokePrincipalSessionsRevokesActive(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	principalID := uuid.New()
	activeID := uuid.New()
	revokedID := uuid.New()
	expiredID := uuid.New()
	otherPrincipalID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          activeID,
		principalID: principalID,
		tokenHash:   hashOpaqueToken("active-principal-token"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})
	store.putSession(fakeSessionRow{
		id:          revokedID,
		principalID: principalID,
		tokenHash:   hashOpaqueToken("already-revoked-token"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
		revokedAt:   pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
	store.putSession(fakeSessionRow{
		id:          expiredID,
		principalID: principalID,
		tokenHash:   hashOpaqueToken("expired-principal-token"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Hour), Valid: true},
	})
	store.putSession(fakeSessionRow{
		id:          uuid.New(),
		principalID: otherPrincipalID,
		tokenHash:   hashOpaqueToken("other-principal-token"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	if err := mgr.RevokePrincipalSessions(context.Background(), principalID); err != nil {
		t.Fatalf("RevokePrincipalSessions: unexpected error: %v", err)
	}

	active, ok := store.getByID(activeID)
	if !ok || !active.revokedAt.Valid {
		t.Fatal("RevokePrincipalSessions: expected active session to be revoked")
	}
	alreadyRevoked, ok := store.getByID(revokedID)
	if !ok || !alreadyRevoked.revokedAt.Valid {
		t.Fatal("RevokePrincipalSessions: expected previously revoked session to remain revoked")
	}
	expired, ok := store.getByID(expiredID)
	if !ok || expired.revokedAt.Valid {
		t.Fatal("RevokePrincipalSessions: expired session should not be updated")
	}
}

func TestRevokePrincipalSessionsZeroRowsOK(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	if err := mgr.RevokePrincipalSessions(context.Background(), uuid.New()); err != nil {
		t.Fatalf("RevokePrincipalSessions (zero rows): unexpected error: %v", err)
	}
}

var _ database.DBTX = (*fakeSessionTx)(nil)
var _ database.DBTX = (*fakeSessionStore)(nil)
