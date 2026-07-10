package vmactions

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// fakeClaimRow holds the state of a single vm_action_claims row in the fake
// in-memory store used by these tests.
type fakeClaimRow struct {
	itemID           uuid.UUID
	action           string
	actorPrincipalID uuid.UUID
	detail           *string
	claimedAt        time.Time
}

// fakeClaimsDB is a minimal database.DBTX implementation that reproduces the
// one invariant the real schema enforces: at most one active row per
// inventory_item_id (the primary key on vm_action_claims). This lets the
// claim-conflict logic in Claims be exercised without a live database.
type fakeClaimsDB struct {
	mu     sync.Mutex
	claims map[uuid.UUID]fakeClaimRow
}

func newFakeClaimsDB() *fakeClaimsDB {
	return &fakeClaimsDB{claims: make(map[uuid.UUID]fakeClaimRow)}
}

func (f *fakeClaimsDB) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	switch {
	case strings.Contains(sql, "DELETE FROM vm_action_claims") && strings.Contains(sql, "claimed_at <"):
		cutoff := args[0].(pgtype.Timestamptz).Time
		f.mu.Lock()
		defer f.mu.Unlock()
		var deleted int64
		for itemID, row := range f.claims {
			if row.claimedAt.Before(cutoff) {
				delete(f.claims, itemID)
				deleted++
			}
		}
		return pgconn.NewCommandTag("DELETE " + strconv.FormatInt(deleted, 10)), nil
	case strings.Contains(sql, "DELETE FROM vm_action_claims"):
		if err := ctx.Err(); err != nil {
			return pgconn.CommandTag{}, err
		}
		itemID, ok := args[0].(uuid.UUID)
		if !ok {
			return pgconn.CommandTag{}, errors.New("fakeClaimsDB: unexpected arg type for delete")
		}
		f.mu.Lock()
		delete(f.claims, itemID)
		f.mu.Unlock()
		return pgconn.CommandTag{}, nil
	default:
		return pgconn.CommandTag{}, errors.New("fakeClaimsDB: unsupported Exec query")
	}
}

func (f *fakeClaimsDB) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) {
	return nil, errors.New("fakeClaimsDB: Query not supported")
}

func (f *fakeClaimsDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	switch {
	case strings.Contains(sql, "INSERT INTO vm_action_claims"):
		itemID := args[0].(uuid.UUID)
		action := args[1].(string)
		actorID := args[2].(uuid.UUID)
		detail, _ := args[3].(*string)

		f.mu.Lock()
		defer f.mu.Unlock()
		if _, exists := f.claims[itemID]; exists {
			// ON CONFLICT DO NOTHING: no row is returned.
			return fakeRow{err: pgx.ErrNoRows}
		}

		f.claims[itemID] = fakeClaimRow{
			itemID:           itemID,
			action:           action,
			actorPrincipalID: actorID,
			detail:           detail,
			claimedAt:        time.Now().UTC(),
		}
		return fakeRow{row: f.claims[itemID]}
	case strings.Contains(sql, "SELECT") && strings.Contains(sql, "FROM vm_action_claims"):
		itemID := args[0].(uuid.UUID)
		f.mu.Lock()
		defer f.mu.Unlock()
		row, ok := f.claims[itemID]
		if !ok {
			return fakeRow{err: pgx.ErrNoRows}
		}
		return fakeRow{row: row}
	default:
		return fakeRow{err: errors.New("fakeClaimsDB: unsupported QueryRow query")}
	}
}

// fakeRow implements pgx.Row, scanning the fields in the same order the
// generated ClaimVMAction/GetVMActionClaim queries select them:
// inventory_item_id, action, actor_principal_id, claimed_at, detail.
type fakeRow struct {
	row fakeClaimRow
	err error
}

func (r fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}

	*(dest[0].(*uuid.UUID)) = r.row.itemID
	*(dest[1].(*string)) = r.row.action
	*(dest[2].(*uuid.UUID)) = r.row.actorPrincipalID
	if claimedAt, ok := dest[3].(*pgtype.Timestamptz); ok {
		claimedAt.Time = r.row.claimedAt
		claimedAt.Valid = true
	}
	if detail, ok := dest[4].(**string); ok {
		*detail = r.row.detail
	}

	return nil
}

func TestClaimsSecondClaimReportsConflict(t *testing.T) {
	db := newFakeClaimsDB()
	claims := NewClaims(db)
	itemID := uuid.New()
	actorID := uuid.New()

	if err := claims.Claim(context.Background(), itemID, "power_action", actorID, ""); err != nil {
		t.Fatalf("first claim: unexpected error: %v", err)
	}

	err := claims.Claim(context.Background(), itemID, "rename_vm", actorID, "")
	if err == nil {
		t.Fatal("second claim on the same VM: expected error, got nil")
	}
	if !IsActionInProgress(err) {
		t.Errorf("second claim on the same VM: expected ErrActionInProgress, got %v", err)
	}
}

func TestClaimsReleaseAllowsLaterClaim(t *testing.T) {
	db := newFakeClaimsDB()
	claims := NewClaims(db)
	itemID := uuid.New()
	actorID := uuid.New()

	if err := claims.Claim(context.Background(), itemID, "power_action", actorID, ""); err != nil {
		t.Fatalf("first claim: unexpected error: %v", err)
	}
	if err := claims.Release(context.Background(), itemID); err != nil {
		t.Fatalf("release: unexpected error: %v", err)
	}

	if err := claims.Claim(context.Background(), itemID, "rename_vm", actorID, ""); err != nil {
		t.Errorf("claim after release: expected success, got %v", err)
	}
}

func TestWithClaimReleasesOnActionFailure(t *testing.T) {
	db := newFakeClaimsDB()
	claims := NewClaims(db)
	itemID := uuid.New()
	actorID := uuid.New()
	boom := errors.New("boom")

	err := claims.WithClaim(context.Background(), itemID, "delete_vm", actorID, "", func() error {
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("WithClaim: expected the wrapped action error, got %v", err)
	}

	// The claim must have been released even though the action failed, so a
	// subsequent claim on the same VM should succeed.
	if err := claims.Claim(context.Background(), itemID, "rename_vm", actorID, ""); err != nil {
		t.Errorf("claim after failed WithClaim: expected success, got %v", err)
	}
}

func TestClaimsReleaseSurvivesCallerCancel(t *testing.T) {
	db := newFakeClaimsDB()
	claims := NewClaims(db)
	itemID := uuid.New()
	actorID := uuid.New()

	ctx, cancel := context.WithCancel(context.Background())
	if err := claims.Claim(ctx, itemID, "power_action", actorID, ""); err != nil {
		t.Fatalf("first claim: unexpected error: %v", err)
	}
	cancel()

	if err := claims.Release(ctx, itemID); err != nil {
		t.Fatalf("release with canceled caller context: unexpected error: %v", err)
	}

	if err := claims.Claim(context.Background(), itemID, "rename_vm", actorID, ""); err != nil {
		t.Errorf("claim after release: expected success, got %v", err)
	}
}

func TestClaimsSweepStaleDeletesOnlyOldRows(t *testing.T) {
	db := newFakeClaimsDB()
	claims := NewClaims(db)
	staleItemID := uuid.New()
	recentItemID := uuid.New()
	actorID := uuid.New()

	if err := claims.Claim(context.Background(), staleItemID, "power_action", actorID, ""); err != nil {
		t.Fatalf("stale claim: unexpected error: %v", err)
	}
	if err := claims.Claim(context.Background(), recentItemID, "power_action", actorID, ""); err != nil {
		t.Fatalf("recent claim: unexpected error: %v", err)
	}

	db.mu.Lock()
	staleRow := db.claims[staleItemID]
	staleRow.claimedAt = time.Now().Add(-3 * time.Hour)
	db.claims[staleItemID] = staleRow
	db.mu.Unlock()

	swept, err := claims.SweepStale(context.Background(), 2*time.Hour)
	if err != nil {
		t.Fatalf("sweep stale: unexpected error: %v", err)
	}
	if swept != 1 {
		t.Fatalf("sweep stale: expected 1 row deleted, got %d", swept)
	}

	if err := claims.Claim(context.Background(), staleItemID, "rename_vm", actorID, ""); err != nil {
		t.Errorf("claim on swept VM: expected success, got %v", err)
	}
	if err := claims.Claim(context.Background(), recentItemID, "rename_vm", actorID, ""); err == nil {
		t.Fatal("claim on recent VM during active claim: expected conflict, got nil")
	} else if !IsActionInProgress(err) {
		t.Fatalf("claim on recent VM during active claim: expected ErrActionInProgress, got %v", err)
	}
}

func TestClaimsRecoveryLoopExitsOnCancel(t *testing.T) {
	db := newFakeClaimsDB()
	claims := NewClaims(db)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		claims.startRecovery(ctx, time.Minute, 10*time.Millisecond)
		close(done)
	}()

	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("recovery loop did not exit after context cancellation")
	}
}

func TestClaimsUnrelatedVMsDoNotBlockEachOther(t *testing.T) {
	db := newFakeClaimsDB()
	claims := NewClaims(db)
	itemA := uuid.New()
	itemB := uuid.New()
	actorID := uuid.New()

	if err := claims.Claim(context.Background(), itemA, "power_action", actorID, ""); err != nil {
		t.Fatalf("claim on VM A: unexpected error: %v", err)
	}
	if err := claims.Claim(context.Background(), itemB, "power_action", actorID, ""); err != nil {
		t.Errorf("claim on unrelated VM B: expected success, got %v", err)
	}
}
