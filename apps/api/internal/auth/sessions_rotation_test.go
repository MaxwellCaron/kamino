package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestRotateSessionSuccessfulRotation(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	oldID := uuid.New()
	oldHash := hashOpaqueToken("old-raw-token")
	store.putSession(fakeSessionRow{
		id:          oldID,
		principalID: uuid.New(),
		tokenHash:   oldHash,
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	newToken, session, err := mgr.RotateSession(context.Background(), "old-raw-token", "ua", "1.2.3.4")
	if err != nil {
		t.Fatalf("RotateSession: unexpected error: %v", err)
	}
	if newToken == "" {
		t.Error("RotateSession: expected a non-empty new token")
	}

	newRow, ok := store.getByID(session.ID)
	if !ok {
		t.Fatal("RotateSession: new session row was not created")
	}
	if newRow.familyID != familyID {
		t.Errorf("RotateSession: new session family = %v, want %v", newRow.familyID, familyID)
	}

	oldRow, ok := store.getByID(oldID)
	if !ok {
		t.Fatal("RotateSession: old session row no longer exists")
	}
	if !oldRow.revokedAt.Valid {
		t.Error("RotateSession: old session expected to be revoked, was not")
	}
	if oldRow.replacedBySessionID == nil || *oldRow.replacedBySessionID != session.ID {
		t.Errorf("RotateSession: old session ReplacedBySessionID = %v, want %v", oldRow.replacedBySessionID, session.ID)
	}
}

func TestRotateSessionReplayOfAlreadyRotatedTokenRevokesFamily(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	oldID := uuid.New()
	oldHash := hashOpaqueToken("old-raw-token")
	store.putSession(fakeSessionRow{
		id:          oldID,
		principalID: uuid.New(),
		tokenHash:   oldHash,
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	// First rotation succeeds and revokes+replaces the old session.
	if _, _, err := mgr.RotateSession(context.Background(), "old-raw-token", "ua", "1.2.3.4"); err != nil {
		t.Fatalf("first RotateSession: unexpected error: %v", err)
	}

	// Replaying the OLD (now-revoked, now-replaced... wait: replayed) token
	// again: branch 3 (revoked WITHOUT ReplacedBySessionID) only applies
	// when ReplacedBySessionID is nil. Since the first rotation set
	// ReplacedBySessionID, a second call with the same old token hits
	// branch 2 (replay with replacement), NOT branch 3. To exercise branch
	// 3 (theft response: revoked, no replacement, family revoked), we need
	// a session that's revoked but was never replaced. Simulate that
	// directly here.
	theftID := uuid.New()
	theftFamilyID := uuid.New()
	theftHash := hashOpaqueToken("theft-raw-token")
	store.putSession(fakeSessionRow{
		id:          theftID,
		principalID: uuid.New(),
		tokenHash:   theftHash,
		familyID:    theftFamilyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
		revokedAt:   pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		// ReplacedBySessionID intentionally nil: revoked-without-replacement.
	})
	// A sibling session in the same family, still active, to verify the
	// family-wide revoke actually fires.
	siblingID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          siblingID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("sibling-raw-token"),
		familyID:    theftFamilyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	_, _, err := mgr.RotateSession(context.Background(), "theft-raw-token", "ua", "1.2.3.4")
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("RotateSession (theft replay): expected ErrInvalidSession, got %v", err)
	}

	sibling, ok := store.getByID(siblingID)
	if !ok {
		t.Fatal("sibling session row no longer exists")
	}
	if !sibling.revokedAt.Valid {
		t.Error("RotateSession (theft replay): sibling session in the same family expected to be revoked, was not")
	}
}

func TestRotateSessionReplayBeforeReplacementDoesNotRevokeFamily(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	replacedByID := uuid.New()
	revokedID := uuid.New()
	revokedHash := hashOpaqueToken("revoked-raw-token")
	store.putSession(fakeSessionRow{
		id:                  revokedID,
		principalID:         uuid.New(),
		tokenHash:           revokedHash,
		familyID:            familyID,
		expiresAt:           pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
		revokedAt:           pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		replacedBySessionID: &replacedByID,
	})
	siblingID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          siblingID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("sibling-raw-token-2"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	_, _, err := mgr.RotateSession(context.Background(), "revoked-raw-token", "ua", "1.2.3.4")
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("RotateSession (replay with replacement): expected ErrInvalidSession, got %v", err)
	}

	sibling, ok := store.getByID(siblingID)
	if !ok {
		t.Fatal("sibling session row no longer exists")
	}
	if sibling.revokedAt.Valid {
		t.Error("RotateSession (replay with replacement): sibling session in the same family must NOT be revoked")
	}
}

func TestRotateSessionExpiredTokenRevokesFamily(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	expiredID := uuid.New()
	expiredHash := hashOpaqueToken("expired-raw-token")
	store.putSession(fakeSessionRow{
		id:          expiredID,
		principalID: uuid.New(),
		tokenHash:   expiredHash,
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Hour), Valid: true},
	})
	siblingID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          siblingID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("sibling-raw-token-3"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	_, _, err := mgr.RotateSession(context.Background(), "expired-raw-token", "ua", "1.2.3.4")
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("RotateSession (expired): expected ErrInvalidSession, got %v", err)
	}

	sibling, ok := store.getByID(siblingID)
	if !ok {
		t.Fatal("sibling session row no longer exists")
	}
	if !sibling.revokedAt.Valid {
		t.Error("RotateSession (expired): sibling session in the same family expected to be revoked, was not")
	}
}

func TestRotateSessionUnknownTokenReturnsInvalidSession(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	_, _, err := mgr.RotateSession(context.Background(), "never-issued-token", "ua", "1.2.3.4")
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("RotateSession (unknown token): expected ErrInvalidSession, got %v", err)
	}
}
