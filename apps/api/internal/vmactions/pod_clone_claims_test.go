package vmactions

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestPodCloneClaimsSecondClaimReportsConflict(t *testing.T) {
	db := newFakePodCloneClaimsDB()
	claims := NewPodCloneClaims(db)
	podID := uuid.New()
	userID := uuid.New()
	actorID := uuid.New()

	if err := claims.Claim(context.Background(), podID, userID, "clone", actorID); err != nil {
		t.Fatalf("first claim: unexpected error: %v", err)
	}

	err := claims.Claim(context.Background(), podID, userID, "reclone", actorID)
	if err == nil {
		t.Fatal("second claim on the same pod clone: expected error, got nil")
	}
	if !IsActionInProgress(err) {
		t.Errorf("second claim on the same pod clone: expected ErrActionInProgress, got %v", err)
	}
}

func TestPodCloneClaimsReleaseAllowsLaterClaim(t *testing.T) {
	db := newFakePodCloneClaimsDB()
	claims := NewPodCloneClaims(db)
	podID := uuid.New()
	userID := uuid.New()
	actorID := uuid.New()

	if err := claims.Claim(context.Background(), podID, userID, "clone", actorID); err != nil {
		t.Fatalf("first claim: unexpected error: %v", err)
	}
	if err := claims.Release(context.Background(), podID, userID); err != nil {
		t.Fatalf("release: unexpected error: %v", err)
	}

	if err := claims.Claim(context.Background(), podID, userID, "reclone", actorID); err != nil {
		t.Errorf("claim after release: expected success, got %v", err)
	}
}

func TestPodCloneClaimsDifferentUsersDoNotBlockEachOther(t *testing.T) {
	db := newFakePodCloneClaimsDB()
	claims := NewPodCloneClaims(db)
	podID := uuid.New()
	userA := uuid.New()
	userB := uuid.New()
	actorID := uuid.New()

	if err := claims.Claim(context.Background(), podID, userA, "clone", actorID); err != nil {
		t.Fatalf("claim for user A: unexpected error: %v", err)
	}
	if err := claims.Claim(context.Background(), podID, userB, "clone", actorID); err != nil {
		t.Errorf("claim for unrelated user B: expected success, got %v", err)
	}
}

func TestPodCloneClaimsGroupAndMemberConflictBothWays(t *testing.T) {
	db := newFakePodCloneClaimsDB()
	claims := NewPodCloneClaims(db)
	podID := uuid.New()
	userID := uuid.New()
	groupID := uuid.New()
	actorID := uuid.New()
	db.setEffectivePrincipals(userID, groupID)

	if err := claims.Claim(context.Background(), podID, userID, "clone", actorID); err != nil {
		t.Fatalf("user claim: unexpected error: %v", err)
	}
	if err := claims.Claim(context.Background(), podID, groupID, "clone", actorID); !IsActionInProgress(err) {
		t.Fatalf("group claim after user claim: expected conflict, got %v", err)
	}

	if err := claims.Release(context.Background(), podID, userID); err != nil {
		t.Fatalf("release user claim: unexpected error: %v", err)
	}
	if err := claims.Claim(context.Background(), podID, groupID, "clone", actorID); err != nil {
		t.Fatalf("group claim: unexpected error: %v", err)
	}
	if err := claims.Claim(context.Background(), podID, userID, "clone", actorID); !IsActionInProgress(err) {
		t.Fatalf("user claim after group claim: expected conflict, got %v", err)
	}
}

func TestPodCloneClaimsSweepStaleDeletesOnlyOldRows(t *testing.T) {
	db := newFakePodCloneClaimsDB()
	claims := NewPodCloneClaims(db)
	podID := uuid.New()
	userID := uuid.New()
	actorID := uuid.New()

	if err := claims.Claim(context.Background(), podID, userID, "clone", actorID); err != nil {
		t.Fatalf("claim: unexpected error: %v", err)
	}

	db.mu.Lock()
	key := fakePodCloneClaimKey{podID: podID, userPrincipalID: userID}
	row := db.claims[key]
	row.claimedAt = time.Now().Add(-30 * time.Minute)
	db.claims[key] = row
	db.mu.Unlock()

	swept, err := claims.SweepStale(context.Background(), 15*time.Minute)
	if err != nil {
		t.Fatalf("sweep stale: unexpected error: %v", err)
	}
	if swept != 1 {
		t.Fatalf("sweep stale: expected 1 row deleted, got %d", swept)
	}

	if err := claims.Claim(context.Background(), podID, userID, "clone", actorID); err != nil {
		t.Errorf("claim after sweep: expected success, got %v", err)
	}
}
