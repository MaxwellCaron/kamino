package vmactions

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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

func TestPodCloneClaimsClearAllDeletesEveryRow(t *testing.T) {
	db := newFakePodCloneClaimsDB()
	claims := NewPodCloneClaims(db)
	actorID := uuid.New()
	targets := []struct {
		podID  uuid.UUID
		userID uuid.UUID
	}{
		{podID: uuid.New(), userID: uuid.New()},
		{podID: uuid.New(), userID: uuid.New()},
	}

	for _, target := range targets {
		if err := claims.Claim(context.Background(), target.podID, target.userID, "clone", actorID); err != nil {
			t.Fatalf("claim: unexpected error: %v", err)
		}
	}

	cleared, err := claims.ClearAll(context.Background())
	if err != nil {
		t.Fatalf("clear all: unexpected error: %v", err)
	}
	if cleared != int64(len(targets)) {
		t.Fatalf("clear all: cleared %d rows, want %d", cleared, len(targets))
	}

	for _, target := range targets {
		if err := claims.Claim(context.Background(), target.podID, target.userID, "delete", actorID); err != nil {
			t.Errorf("claim after clear: unexpected error: %v", err)
		}
	}
}

type fakePodCloneClaimKey struct {
	podID           uuid.UUID
	userPrincipalID uuid.UUID
}

type fakePodCloneClaimRow struct {
	podID            uuid.UUID
	userPrincipalID  uuid.UUID
	action           string
	actorPrincipalID uuid.UUID
}

type fakePodCloneClaimsDB struct {
	mu                  sync.Mutex
	claims              map[fakePodCloneClaimKey]fakePodCloneClaimRow
	effectivePrincipals map[uuid.UUID]map[uuid.UUID]struct{}
}

func newFakePodCloneClaimsDB() *fakePodCloneClaimsDB {
	return &fakePodCloneClaimsDB{
		claims:              make(map[fakePodCloneClaimKey]fakePodCloneClaimRow),
		effectivePrincipals: make(map[uuid.UUID]map[uuid.UUID]struct{}),
	}
}

func (f *fakePodCloneClaimsDB) setEffectivePrincipals(principalID uuid.UUID, effectiveIDs ...uuid.UUID) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.effectivePrincipals[principalID] == nil {
		f.effectivePrincipals[principalID] = make(map[uuid.UUID]struct{})
	}
	for _, effectiveID := range effectiveIDs {
		f.effectivePrincipals[principalID][effectiveID] = struct{}{}
	}
}

func (f *fakePodCloneClaimsDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	switch {
	case strings.Contains(sql, "DELETE FROM pod_clone_claims") && len(args) == 0:
		f.mu.Lock()
		deleted := int64(len(f.claims))
		clear(f.claims)
		f.mu.Unlock()
		return pgconn.NewCommandTag("DELETE " + formatInt64(deleted)), nil
	case strings.Contains(sql, "DELETE FROM pod_clone_claims"):
		podID := args[0].(uuid.UUID)
		userPrincipalID := args[1].(uuid.UUID)
		f.mu.Lock()
		delete(f.claims, fakePodCloneClaimKey{podID: podID, userPrincipalID: userPrincipalID})
		f.mu.Unlock()
		return pgconn.CommandTag{}, nil
	default:
		return pgconn.CommandTag{}, errors.New("fakePodCloneClaimsDB: unsupported Exec query")
	}
}

func (f *fakePodCloneClaimsDB) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) {
	return nil, errors.New("fakePodCloneClaimsDB: Query not supported")
}

func (f *fakePodCloneClaimsDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	switch {
	case strings.Contains(sql, "INSERT INTO pod_clone_claims"):
		podID := args[0].(uuid.UUID)
		userPrincipalID := args[1].(uuid.UUID)
		action := args[2].(string)
		actorID := args[3].(uuid.UUID)

		f.mu.Lock()
		defer f.mu.Unlock()
		key := fakePodCloneClaimKey{podID: podID, userPrincipalID: userPrincipalID}
		if f.claimConflictsLocked(podID, userPrincipalID) {
			return fakePodCloneClaimRowScanner{err: pgx.ErrNoRows}
		}

		row := fakePodCloneClaimRow{
			podID:            podID,
			userPrincipalID:  userPrincipalID,
			action:           action,
			actorPrincipalID: actorID,
		}
		f.claims[key] = row
		return fakePodCloneClaimRowScanner{row: row}
	default:
		return fakePodCloneClaimRowScanner{err: errors.New("fakePodCloneClaimsDB: unsupported QueryRow query")}
	}
}

func (f *fakePodCloneClaimsDB) claimConflictsLocked(podID, targetPrincipalID uuid.UUID) bool {
	for key := range f.claims {
		if key.podID != podID {
			continue
		}
		if key.userPrincipalID == targetPrincipalID ||
			f.isEffectiveLocked(targetPrincipalID, key.userPrincipalID) ||
			f.isEffectiveLocked(key.userPrincipalID, targetPrincipalID) {
			return true
		}
	}
	return false
}

func (f *fakePodCloneClaimsDB) isEffectiveLocked(principalID, effectiveID uuid.UUID) bool {
	if principalID == effectiveID {
		return true
	}
	_, ok := f.effectivePrincipals[principalID][effectiveID]
	return ok
}

type fakePodCloneClaimRowScanner struct {
	row fakePodCloneClaimRow
	err error
}

func (r fakePodCloneClaimRowScanner) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}

	*(dest[0].(*uuid.UUID)) = r.row.podID
	*(dest[1].(*uuid.UUID)) = r.row.userPrincipalID
	*(dest[2].(*string)) = r.row.action
	*(dest[3].(*uuid.UUID)) = r.row.actorPrincipalID
	return nil
}

func formatInt64(n int64) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
