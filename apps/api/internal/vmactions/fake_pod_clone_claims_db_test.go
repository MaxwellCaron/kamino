package vmactions

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

type fakePodCloneClaimKey struct {
	podID           uuid.UUID
	userPrincipalID uuid.UUID
}

type fakePodCloneClaimRow struct {
	podID            uuid.UUID
	userPrincipalID  uuid.UUID
	action           string
	actorPrincipalID uuid.UUID
	claimedAt        time.Time
}

type fakePodCloneClaimsDB struct {
	mu                  sync.Mutex
	claims              map[fakePodCloneClaimKey]fakePodCloneClaimRow
	effectivePrincipals map[uuid.UUID]map[uuid.UUID]struct{}
}

// NewTestPodCloneClaimsDB returns an in-memory DBTX for unit tests.
func NewTestPodCloneClaimsDB() database.DBTX {
	return &fakePodCloneClaimsDB{
		claims:              make(map[fakePodCloneClaimKey]fakePodCloneClaimRow),
		effectivePrincipals: make(map[uuid.UUID]map[uuid.UUID]struct{}),
	}
}

func newFakePodCloneClaimsDB() *fakePodCloneClaimsDB {
	return NewTestPodCloneClaimsDB().(*fakePodCloneClaimsDB)
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
	case strings.Contains(sql, "DELETE FROM pod_clone_claims") && strings.Contains(sql, "claimed_at <"):
		cutoff := args[0].(pgtype.Timestamptz).Time
		f.mu.Lock()
		defer f.mu.Unlock()
		var deleted int64
		for key, row := range f.claims {
			if row.claimedAt.Before(cutoff) {
				delete(f.claims, key)
				deleted++
			}
		}
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
			claimedAt:        time.Now(),
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
