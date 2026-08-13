package auth

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestDeleteExpiredSessionsDeletesRowPastGracePeriod(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	id := uuid.New()
	store.putSession(fakeSessionRow{
		id:          id,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("expired-past-grace"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-48 * time.Hour), Valid: true},
	})

	deleted, err := mgr.DeleteExpiredSessions(context.Background(), 24*time.Hour)
	if err != nil {
		t.Fatalf("DeleteExpiredSessions: unexpected error: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("DeleteExpiredSessions: expected 1 row deleted, got %d", deleted)
	}
	if _, ok := store.getByID(id); ok {
		t.Error("DeleteExpiredSessions: expected row past grace period to be deleted")
	}
}

func TestDeleteExpiredSessionsDeletesExpiredPredecessorEvenWithActiveSuccessor(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	familyID := uuid.New()
	predecessorID := uuid.New()
	activeID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          predecessorID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("predecessor-expired"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-72 * time.Hour), Valid: true},
	})
	store.putSession(fakeSessionRow{
		id:          activeID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("active-successor"),
		familyID:    familyID,
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	deleted, err := mgr.DeleteExpiredSessions(context.Background(), 24*time.Hour)
	if err != nil {
		t.Fatalf("DeleteExpiredSessions: unexpected error: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("DeleteExpiredSessions: expected 1 row deleted, got %d", deleted)
	}
	if _, ok := store.getByID(predecessorID); ok {
		t.Error("DeleteExpiredSessions: expected expired predecessor to be deleted even though its family has an active member")
	}
	if _, ok := store.getByID(activeID); !ok {
		t.Error("DeleteExpiredSessions: expected active successor to be kept")
	}
}

func TestDeleteExpiredSessionsKeepsRowsNotYetPastGracePeriod(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	recentlyExpiredID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          recentlyExpiredID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("recently-expired"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Hour), Valid: true},
	})

	deleted, err := mgr.DeleteExpiredSessions(context.Background(), 24*time.Hour)
	if err != nil {
		t.Fatalf("DeleteExpiredSessions: unexpected error: %v", err)
	}
	if deleted != 0 {
		t.Fatalf("DeleteExpiredSessions: expected 0 rows deleted, got %d", deleted)
	}
	if _, ok := store.getByID(recentlyExpiredID); !ok {
		t.Error("DeleteExpiredSessions: expected row within the evidence grace period to be kept")
	}
}

func TestDeleteExpiredSessionsHandlesMultipleRowsInOneSweep(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	expiredID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          expiredID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("sweep-expired"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(-48 * time.Hour), Valid: true},
	})

	activeID := uuid.New()
	store.putSession(fakeSessionRow{
		id:          activeID,
		principalID: uuid.New(),
		tokenHash:   hashOpaqueToken("sweep-active"),
		familyID:    uuid.New(),
		expiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Hour), Valid: true},
	})

	deleted, err := mgr.DeleteExpiredSessions(context.Background(), 24*time.Hour)
	if err != nil {
		t.Fatalf("DeleteExpiredSessions: unexpected error: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("DeleteExpiredSessions: expected 1 row deleted, got %d", deleted)
	}
	if _, ok := store.getByID(expiredID); ok {
		t.Error("DeleteExpiredSessions: expected expired row to be deleted")
	}
	if _, ok := store.getByID(activeID); !ok {
		t.Error("DeleteExpiredSessions: expected active row to be kept")
	}
}

func TestDeleteExpiredSessionsZeroRowsOK(t *testing.T) {
	store := newFakeSessionStore()
	mgr := newTestSessionManager(store)

	deleted, err := mgr.DeleteExpiredSessions(context.Background(), 24*time.Hour)
	if err != nil {
		t.Fatalf("DeleteExpiredSessions (zero rows): unexpected error: %v", err)
	}
	if deleted != 0 {
		t.Fatalf("DeleteExpiredSessions (zero rows): expected 0, got %d", deleted)
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
			t.Fatal("startCleanup: expected immediate sweep to delete the expired row")
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
