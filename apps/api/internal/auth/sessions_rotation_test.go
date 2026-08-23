package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func strPtr(value string) *string {
	return &value
}

func TestRefreshSessionSuccessfulRotation(t *testing.T) {
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
		createdAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-10 * time.Minute), Valid: true},
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	newToken, session, err := mgr.RefreshSession(context.Background(), "old-raw-token", "ua", "1.2.3.4")
	if err != nil {
		t.Fatalf("RefreshSession: unexpected error: %v", err)
	}
	if newToken == "" || newToken == "old-raw-token" {
		t.Error("RefreshSession: expected a new non-empty token")
	}

	newRow, ok := store.getByID(session.ID)
	if !ok {
		t.Fatal("RefreshSession: new session row was not created")
	}
	if newRow.familyID != familyID {
		t.Errorf("RefreshSession: new session family = %v, want %v", newRow.familyID, familyID)
	}

	oldRow, ok := store.getByID(oldID)
	if !ok {
		t.Fatal("RefreshSession: old session row no longer exists")
	}
	if !oldRow.revokedAt.Valid {
		t.Error("RefreshSession: old session expected to be revoked, was not")
	}
	if oldRow.replacedBySessionID == nil || *oldRow.replacedBySessionID != session.ID {
		t.Errorf("RefreshSession: old session ReplacedBySessionID = %v, want %v", oldRow.replacedBySessionID, session.ID)
	}
	if oldRow.userAgent == nil || *oldRow.userAgent != "ua" || oldRow.ipAddress == nil || *oldRow.ipAddress != "1.2.3.4" {
		t.Errorf("RefreshSession: old session fingerprint not updated to rotating request, got ua=%v ip=%v", oldRow.userAgent, oldRow.ipAddress)
	}
}

func TestRefreshSessionYoungTokenTouchesInPlaceWithoutRotating(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	id := uuid.New()
	hash := hashOpaqueToken("young-raw-token")
	originalExpiry := time.Now().UTC().Add(RefreshTokenDuration)
	store.putSession(fakeSessionRow{
		id:          id,
		principalID: uuid.New(),
		tokenHash:   hash,
		familyID:    uuid.New(),
		createdAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Minute), Valid: true},
		lastUsedAt:  pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Minute), Valid: true},
		expiresAt:   pgtype.Timestamptz{Time: originalExpiry, Valid: true},
	})

	before := store.rowCount()

	newToken, session, err := mgr.RefreshSession(context.Background(), "young-raw-token", "ua", "1.2.3.4")
	if err != nil {
		t.Fatalf("RefreshSession: unexpected error: %v", err)
	}
	if newToken != "young-raw-token" {
		t.Errorf("RefreshSession: expected the same raw token to be returned, got %q", newToken)
	}
	if session.ID != id {
		t.Errorf("RefreshSession: expected the same session ID, got %v want %v", session.ID, id)
	}
	if !session.ExpiresAt.Equal(originalExpiry) {
		t.Errorf("RefreshSession: expected unchanged expiry %v, got %v", originalExpiry, session.ExpiresAt)
	}

	if after := store.rowCount(); after != before {
		t.Errorf("RefreshSession: expected no new row to be created, row count went from %d to %d", before, after)
	}

	row, ok := store.getByID(id)
	if !ok {
		t.Fatal("RefreshSession: session row no longer exists")
	}
	if row.revokedAt.Valid {
		t.Error("RefreshSession: touched session must not be revoked")
	}
	if !row.lastUsedAt.Time.After(time.Now().UTC().Add(-time.Second)) {
		t.Errorf("RefreshSession: expected last_used_at to advance, got %v", row.lastUsedAt.Time)
	}
}

func TestRefreshSessionJustUnderRotationThresholdDoesNotRotate(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	id := uuid.New()
	hash := hashOpaqueToken("just-under-threshold-token")
	store.putSession(fakeSessionRow{
		id:          id,
		principalID: uuid.New(),
		tokenHash:   hash,
		familyID:    uuid.New(),
		createdAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-(minimumRefreshRotationAge - time.Second)), Valid: true},
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	before := store.rowCount()

	newToken, session, err := mgr.RefreshSession(context.Background(), "just-under-threshold-token", "ua", "1.2.3.4")
	if err != nil {
		t.Fatalf("RefreshSession: unexpected error: %v", err)
	}
	if newToken != "just-under-threshold-token" {
		t.Error("RefreshSession: expected the token just under the threshold to be touched, not rotated")
	}
	if session.ID != id {
		t.Error("RefreshSession: expected the same session ID for a touch")
	}
	if after := store.rowCount(); after != before {
		t.Errorf("RefreshSession: expected no new row, row count went from %d to %d", before, after)
	}
}

func TestRefreshSessionAtOrPastRotationThresholdRotates(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	id := uuid.New()
	hash := hashOpaqueToken("at-threshold-token")
	store.putSession(fakeSessionRow{
		id:          id,
		principalID: uuid.New(),
		tokenHash:   hash,
		familyID:    uuid.New(),
		createdAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-minimumRefreshRotationAge), Valid: true},
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	before := store.rowCount()

	newToken, session, err := mgr.RefreshSession(context.Background(), "at-threshold-token", "ua", "1.2.3.4")
	if err != nil {
		t.Fatalf("RefreshSession: unexpected error: %v", err)
	}
	if newToken == "at-threshold-token" {
		t.Error("RefreshSession: expected a token exactly at the threshold to rotate")
	}
	if session.ID == id {
		t.Error("RefreshSession: expected a new session ID for a rotation")
	}
	if after := store.rowCount(); after != before+1 {
		t.Errorf("RefreshSession: expected exactly one new row, row count went from %d to %d", before, after)
	}
}

func TestRefreshSessionReplayedTokenSameFingerprintInsideWindowIsCollision(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	replacedByID := uuid.New()
	revokedID := uuid.New()
	revokedHash := hashOpaqueToken("collision-raw-token")
	store.putSession(fakeSessionRow{
		id:                  revokedID,
		principalID:         uuid.New(),
		tokenHash:           revokedHash,
		familyID:            familyID,
		userAgent:           strPtr("ua"),
		ipAddress:           strPtr("1.2.3.4"),
		expiresAt:           pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
		revokedAt:           pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Second), Valid: true},
		replacedBySessionID: &replacedByID,
	})
	store.putSession(fakeSessionRow{
		id:          replacedByID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("collision-successor-token"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	_, _, err := mgr.RefreshSession(context.Background(), "collision-raw-token", "ua", "1.2.3.4")
	if !errors.Is(err, ErrRefreshCollision) {
		t.Fatalf("RefreshSession (collision): expected ErrRefreshCollision, got %v", err)
	}

	successor, ok := store.getByID(replacedByID)
	if !ok {
		t.Fatal("successor session row no longer exists")
	}
	if successor.revokedAt.Valid {
		t.Error("RefreshSession (collision): successor session must remain active")
	}
}

func TestRefreshSessionReplayedTokenSameFingerprintOutsideWindowRevokesFamily(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	replacedByID := uuid.New()
	revokedID := uuid.New()
	revokedHash := hashOpaqueToken("stale-replay-raw-token")
	store.putSession(fakeSessionRow{
		id:                  revokedID,
		principalID:         uuid.New(),
		tokenHash:           revokedHash,
		familyID:            familyID,
		userAgent:           new("ua"),
		ipAddress:           new("1.2.3.4"),
		expiresAt:           pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
		revokedAt:           pgtype.Timestamptz{Time: time.Now().UTC().Add(-10 * time.Second), Valid: true},
		replacedBySessionID: &replacedByID,
	})
	store.putSession(fakeSessionRow{
		id:          replacedByID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("stale-replay-successor-token"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	_, _, err := mgr.RefreshSession(context.Background(), "stale-replay-raw-token", "ua", "1.2.3.4")
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("RefreshSession (replay outside window): expected ErrInvalidSession, got %v", err)
	}

	successor, ok := store.getByID(replacedByID)
	if !ok {
		t.Fatal("successor session row no longer exists")
	}
	if !successor.revokedAt.Valid {
		t.Error("RefreshSession (replay outside window): expected the whole family, including the successor, to be revoked")
	}
}

func TestRefreshSessionReplayedTokenDifferentIPInsideWindowRevokesFamily(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	replacedByID := uuid.New()
	revokedID := uuid.New()
	revokedHash := hashOpaqueToken("different-ip-raw-token")
	store.putSession(fakeSessionRow{
		id:                  revokedID,
		principalID:         uuid.New(),
		tokenHash:           revokedHash,
		familyID:            familyID,
		userAgent:           new("ua"),
		ipAddress:           new("1.2.3.4"),
		expiresAt:           pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
		revokedAt:           pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Second), Valid: true},
		replacedBySessionID: &replacedByID,
	})
	store.putSession(fakeSessionRow{
		id:          replacedByID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("different-ip-successor-token"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	_, _, err := mgr.RefreshSession(context.Background(), "different-ip-raw-token", "ua", "9.9.9.9")
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("RefreshSession (different IP): expected ErrInvalidSession, got %v", err)
	}

	successor, ok := store.getByID(replacedByID)
	if !ok {
		t.Fatal("successor session row no longer exists")
	}
	if !successor.revokedAt.Valid {
		t.Error("RefreshSession (different IP): expected the family to be revoked")
	}
}

func TestRefreshSessionReplayedTokenDifferentUserAgentInsideWindowRevokesFamily(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	replacedByID := uuid.New()
	revokedID := uuid.New()
	revokedHash := hashOpaqueToken("different-ua-raw-token")
	store.putSession(fakeSessionRow{
		id:                  revokedID,
		principalID:         uuid.New(),
		tokenHash:           revokedHash,
		familyID:            familyID,
		userAgent:           new("ua"),
		ipAddress:           new("1.2.3.4"),
		expiresAt:           pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
		revokedAt:           pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Second), Valid: true},
		replacedBySessionID: &replacedByID,
	})
	store.putSession(fakeSessionRow{
		id:          replacedByID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("different-ua-successor-token"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	_, _, err := mgr.RefreshSession(context.Background(), "different-ua-raw-token", "different-ua", "1.2.3.4")
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("RefreshSession (different user agent): expected ErrInvalidSession, got %v", err)
	}

	successor, ok := store.getByID(replacedByID)
	if !ok {
		t.Fatal("successor session row no longer exists")
	}
	if !successor.revokedAt.Valid {
		t.Error("RefreshSession (different user agent): expected the family to be revoked")
	}
}

func TestRefreshSessionConcurrentRequestsFromNewIPAreTreatedAsCollisionAfterFirstRotationUpdatesFingerprint(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	originalID := uuid.New()
	originalHash := hashOpaqueToken("roaming-raw-token")
	store.putSession(fakeSessionRow{
		id:          originalID,
		principalID: uuid.New(),
		tokenHash:   originalHash,
		familyID:    familyID,
		userAgent:   new("ua"),
		ipAddress:   new("9.9.9.9"), // issued on the old network.
		createdAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-10 * time.Minute), Valid: true},
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	// First concurrent tab rotates from the new network.
	_, _, err := mgr.RefreshSession(context.Background(), "roaming-raw-token", "ua", "5.5.5.5")
	if err != nil {
		t.Fatalf("first RefreshSession (roaming rotation): unexpected error: %v", err)
	}

	// Second concurrent tab replays the same now-superseded token from the same new network.
	_, _, err = mgr.RefreshSession(context.Background(), "roaming-raw-token", "ua", "5.5.5.5")
	if !errors.Is(err, ErrRefreshCollision) {
		t.Fatalf("second RefreshSession (roaming replay): expected ErrRefreshCollision, got %v", err)
	}
}

func TestRefreshSessionRevokedWithoutReplacementRevokesFamily(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

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
	siblingID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          siblingID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("theft-sibling-token"),
		familyID:    theftFamilyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	_, _, err := mgr.RefreshSession(context.Background(), "theft-raw-token", "ua", "1.2.3.4")
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("RefreshSession (theft replay): expected ErrInvalidSession, got %v", err)
	}

	sibling, ok := store.getByID(siblingID)
	if !ok {
		t.Fatal("sibling session row no longer exists")
	}
	if !sibling.revokedAt.Valid {
		t.Error("RefreshSession (theft replay): sibling session in the same family expected to be revoked, was not")
	}
}

func TestRefreshSessionExpiredTokenRevokesFamily(t *testing.T) {
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
		tokenHash:   hashOpaqueToken("expired-sibling-token"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	_, _, err := mgr.RefreshSession(context.Background(), "expired-raw-token", "ua", "1.2.3.4")
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("RefreshSession (expired): expected ErrInvalidSession, got %v", err)
	}

	sibling, ok := store.getByID(siblingID)
	if !ok {
		t.Fatal("sibling session row no longer exists")
	}
	if !sibling.revokedAt.Valid {
		t.Error("RefreshSession (expired): sibling session in the same family expected to be revoked, was not")
	}
}

func TestRefreshSessionUnknownTokenReturnsInvalidSession(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	_, _, err := mgr.RefreshSession(context.Background(), "never-issued-token", "ua", "1.2.3.4")
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("RefreshSession (unknown token): expected ErrInvalidSession, got %v", err)
	}
}
