package auth

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestDeleteExpiredSessionFamiliesDeletesFullyExpiredFamily(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	oldID := uuid.New()
	newID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          oldID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("expired-family-old"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-72 * time.Hour), Valid: true},
	})
	store.putSession(fakeSessionRow{
		id:          newID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("expired-family-new"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-48 * time.Hour), Valid: true},
	})

	deleted, err := mgr.DeleteExpiredSessionFamilies(context.Background(), 24*time.Hour)
	if err != nil {
		t.Fatalf("DeleteExpiredSessionFamilies: unexpected error: %v", err)
	}
	if deleted != 2 {
		t.Fatalf("DeleteExpiredSessionFamilies: expected 2 rows deleted, got %d", deleted)
	}
	if _, ok := store.getByID(oldID); ok {
		t.Error("DeleteExpiredSessionFamilies: expected old predecessor row to be deleted")
	}
	if _, ok := store.getByID(newID); ok {
		t.Error("DeleteExpiredSessionFamilies: expected newest row to be deleted")
	}
}

func TestDeleteExpiredSessionFamiliesKeepsFamilyWithActiveMember(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	oldID := uuid.New()
	activeID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          oldID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("kept-family-old"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-72 * time.Hour), Valid: true},
	})
	store.putSession(fakeSessionRow{
		id:          activeID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("kept-family-active"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	deleted, err := mgr.DeleteExpiredSessionFamilies(context.Background(), 24*time.Hour)
	if err != nil {
		t.Fatalf("DeleteExpiredSessionFamilies: unexpected error: %v", err)
	}
	if deleted != 0 {
		t.Fatalf("DeleteExpiredSessionFamilies: expected 0 rows deleted, got %d", deleted)
	}
	if _, ok := store.getByID(oldID); !ok {
		t.Error("DeleteExpiredSessionFamilies: expected old predecessor row to be kept")
	}
	if _, ok := store.getByID(activeID); !ok {
		t.Error("DeleteExpiredSessionFamilies: expected active row to be kept")
	}
}

func TestDeleteExpiredSessionFamiliesHandlesMultipleFamiliesInOneSweep(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	expiredFamilyID := uuid.New()
	expiredID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          expiredID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("sweep-expired"),
		familyID:    expiredFamilyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-48 * time.Hour), Valid: true},
	})

	activeFamilyID := uuid.New()
	activeID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          activeID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("sweep-active"),
		familyID:    activeFamilyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	deleted, err := mgr.DeleteExpiredSessionFamilies(context.Background(), 24*time.Hour)
	if err != nil {
		t.Fatalf("DeleteExpiredSessionFamilies: unexpected error: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("DeleteExpiredSessionFamilies: expected 1 row deleted, got %d", deleted)
	}
	if _, ok := store.getByID(expiredID); ok {
		t.Error("DeleteExpiredSessionFamilies: expected expired family's row to be deleted")
	}
	if _, ok := store.getByID(activeID); !ok {
		t.Error("DeleteExpiredSessionFamilies: expected active family's row to be kept")
	}
}

func TestDeleteExpiredSessionFamiliesZeroRowsOK(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	deleted, err := mgr.DeleteExpiredSessionFamilies(context.Background(), 24*time.Hour)
	if err != nil {
		t.Fatalf("DeleteExpiredSessionFamilies (zero rows): unexpected error: %v", err)
	}
	if deleted != 0 {
		t.Fatalf("DeleteExpiredSessionFamilies (zero rows): expected 0, got %d", deleted)
	}
}

func TestStartCleanupRunsImmediatelyAndStopsOnCancel(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	sessionID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          sessionID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("cleanup-ticker-token"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-48 * time.Hour), Valid: true},
	})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		mgr.startCleanup(ctx, time.Hour, time.Hour)
		close(done)
	}()

	deadline := time.Now().Add(time.Second)
	for {
		if _, ok := store.getByID(sessionID); !ok {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("startCleanup: expected immediate sweep to delete the expired family")
		}
		time.Sleep(time.Millisecond)
	}

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("startCleanup: expected goroutine to stop after context cancellation")
	}
}
