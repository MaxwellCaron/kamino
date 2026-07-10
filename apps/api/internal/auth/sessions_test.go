package auth

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// fakeSessionRow holds the in-memory state of a single auth_sessions row.
type fakeSessionRow struct {
	id                  uuid.UUID
	principalID         uuid.UUID
	tokenHash           string
	familyID            uuid.UUID
	replacedBySessionID *uuid.UUID
	expiresAt           pgtype.Timestamptz
	revokedAt           pgtype.Timestamptz
}

// fakeSessionStore is a minimal implementation of the sessionStore seam
// (database.DBTX plus BeginTx) backed by an in-memory map of auth_sessions
// rows, keyed by token hash. It is modeled on
// vmactions/claims_test.go's fakeClaimsDB: queries are matched by inspecting
// the SQL string. BeginTx returns a *fakeSessionTx that operates on the same
// underlying map so RotateSession/RevokeSession can be exercised end to end
// without a live database.
type fakeSessionStore struct {
	mu       sync.Mutex
	byHash   map[string]*fakeSessionRow
	byID     map[uuid.UUID]*fakeSessionRow
	beginErr error
}

func newFakeSessionStore() *fakeSessionStore {
	return &fakeSessionStore{
		byHash: make(map[string]*fakeSessionRow),
		byID:   make(map[uuid.UUID]*fakeSessionRow),
	}
}

func (f *fakeSessionStore) putSession(row fakeSessionRow) {
	f.mu.Lock()
	defer f.mu.Unlock()
	stored := row
	f.byHash[row.tokenHash] = &stored
	f.byID[row.id] = &stored
}

func (f *fakeSessionStore) getByID(id uuid.UUID) (fakeSessionRow, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.byID[id]
	if !ok {
		return fakeSessionRow{}, false
	}
	return *row, true
}

func (f *fakeSessionStore) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return f.execQuery(sql, args...)
}

func (f *fakeSessionStore) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) {
	return nil, errors.New("fakeSessionStore: Query not supported")
}

func (f *fakeSessionStore) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	return f.queryRow(sql, args...)
}

func (f *fakeSessionStore) BeginTx(_ context.Context, _ pgx.TxOptions) (pgx.Tx, error) {
	if f.beginErr != nil {
		return nil, f.beginErr
	}
	return &fakeSessionTx{store: f}, nil
}

// fakeSessionTx implements pgx.Tx over fakeSessionStore's in-memory map. It
// applies writes (CreateAuthSession/RotateAuthSession/RevokeAuthSession*)
// directly to the shared map on Exec/QueryRow rather than buffering them
// until Commit, since these characterization tests only assert
// post-Commit/post-Rollback-returned-error state, not isolation semantics.
type fakeSessionTx struct {
	store      *fakeSessionStore
	committed  bool
	rolledBack bool
}

func (tx *fakeSessionTx) Begin(_ context.Context) (pgx.Tx, error) {
	panic("fakeSessionTx: nested transactions not supported")
}

func (tx *fakeSessionTx) Commit(_ context.Context) error {
	tx.committed = true
	return nil
}

func (tx *fakeSessionTx) Rollback(_ context.Context) error {
	tx.rolledBack = true
	return nil
}

func (tx *fakeSessionTx) CopyFrom(_ context.Context, _ pgx.Identifier, _ []string, _ pgx.CopyFromSource) (int64, error) {
	panic("fakeSessionTx: CopyFrom not supported")
}

func (tx *fakeSessionTx) SendBatch(_ context.Context, _ *pgx.Batch) pgx.BatchResults {
	panic("fakeSessionTx: SendBatch not supported")
}

func (tx *fakeSessionTx) LargeObjects() pgx.LargeObjects {
	return pgx.LargeObjects{}
}

func (tx *fakeSessionTx) Prepare(_ context.Context, _, _ string) (*pgconn.StatementDescription, error) {
	panic("fakeSessionTx: Prepare not supported")
}

func (tx *fakeSessionTx) Conn() *pgx.Conn {
	return nil
}

func (tx *fakeSessionTx) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return tx.store.execQuery(sql, args...)
}

func (tx *fakeSessionTx) Query(_ context.Context, sql string, _ ...any) (pgx.Rows, error) {
	return nil, errors.New("fakeSessionTx: Query not supported: " + sql)
}

func (tx *fakeSessionTx) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	return tx.store.queryRow(sql, args...)
}

func (store *fakeSessionStore) execQuery(sql string, args ...any) (pgconn.CommandTag, error) {
	store.mu.Lock()
	defer store.mu.Unlock()

	switch {
	case strings.Contains(sql, "INSERT INTO auth_sessions"):
		row := fakeSessionRow{
			id:          args[0].(uuid.UUID),
			principalID: args[1].(uuid.UUID),
			tokenHash:   args[2].(string),
			familyID:    args[3].(uuid.UUID),
			expiresAt:   args[6].(pgtype.Timestamptz),
		}
		store.byHash[row.tokenHash] = &row
		store.byID[row.id] = &row
		return pgconn.CommandTag{}, nil
	case strings.Contains(sql, "UPDATE auth_sessions") && strings.Contains(sql, "replaced_by_session_id"):
		id := args[0].(uuid.UUID)
		replacedBy, _ := args[1].(*uuid.UUID)
		row, ok := store.byID[id]
		if !ok {
			return pgconn.CommandTag{}, pgx.ErrNoRows
		}
		row.revokedAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
		row.replacedBySessionID = replacedBy
		return pgconn.CommandTag{}, nil
	case strings.Contains(sql, "UPDATE auth_sessions") && strings.Contains(sql, "family_id"):
		familyID := args[0].(uuid.UUID)
		var affected int64
		for _, row := range store.byID {
			if row.familyID != familyID || row.revokedAt.Valid {
				continue
			}
			row.revokedAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
			affected++
		}
		return fakeCommandTag(affected), nil
	case strings.Contains(sql, "UPDATE auth_sessions") && strings.Contains(sql, "principal_id = $1"):
		principalID := args[0].(uuid.UUID)
		now := time.Now().UTC()
		var affected int64
		for _, row := range store.byID {
			if row.principalID != principalID || row.revokedAt.Valid {
				continue
			}
			if !row.expiresAt.Valid || !now.Before(row.expiresAt.Time) {
				continue
			}
			row.revokedAt = pgtype.Timestamptz{Time: now, Valid: true}
			affected++
		}
		return fakeCommandTag(affected), nil
	case strings.Contains(sql, "UPDATE auth_sessions") && strings.Contains(sql, "WHERE id = $1"):
		id := args[0].(uuid.UUID)
		row, ok := store.byID[id]
		if !ok {
			return pgconn.CommandTag{}, pgx.ErrNoRows
		}
		if !row.revokedAt.Valid {
			row.revokedAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
		}
		return pgconn.CommandTag{}, nil
	default:
		return pgconn.CommandTag{}, errors.New("fakeSessionStore: unsupported Exec query: " + sql)
	}
}

func (store *fakeSessionStore) queryRow(sql string, args ...any) pgx.Row {
	store.mu.Lock()
	defer store.mu.Unlock()

	if strings.Contains(sql, "EXISTS") && strings.Contains(sql, "principal_id = $2") {
		sessionID := args[0].(uuid.UUID)
		principalID := args[1].(uuid.UUID)
		row, ok := store.byID[sessionID]
		if !ok || row.principalID != principalID || row.revokedAt.Valid {
			return fakeBoolRowResult{value: false}
		}
		now := time.Now().UTC()
		if !row.expiresAt.Valid || !now.Before(row.expiresAt.Time) {
			return fakeBoolRowResult{value: false}
		}
		return fakeBoolRowResult{value: true}
	}

	if !strings.Contains(sql, "FROM auth_sessions") {
		return fakeSessionRowResult{err: errors.New("fakeSessionStore: unsupported QueryRow query: " + sql)}
	}

	tokenHash := args[0].(string)
	row, ok := store.byHash[tokenHash]
	if !ok {
		return fakeSessionRowResult{err: pgx.ErrNoRows}
	}
	return fakeSessionRowResult{row: *row}
}

// fakeBoolRowResult implements pgx.Row for EXISTS-style boolean scans.
type fakeBoolRowResult struct {
	value bool
	err   error
}

func (r fakeBoolRowResult) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	*(dest[0].(*bool)) = r.value
	return nil
}

// fakeCommandTag builds a pgconn.CommandTag reporting the given RowsAffected.
// pgconn.CommandTag's RowsAffected parses the trailing integer out of a
// "UPDATE n" style string, so we synthesize one here.
func fakeCommandTag(rows int64) pgconn.CommandTag {
	return pgconn.NewCommandTag("UPDATE " + strconv.FormatInt(rows, 10))
}

// fakeSessionRowResult implements pgx.Row, scanning fields in the same order
// GetAuthSessionByTokenHashForUpdate selects them.
type fakeSessionRowResult struct {
	row fakeSessionRow
	err error
}

func (r fakeSessionRowResult) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}

	*(dest[0].(*uuid.UUID)) = r.row.id
	*(dest[1].(*uuid.UUID)) = r.row.principalID
	*(dest[2].(*string)) = r.row.tokenHash
	*(dest[3].(*uuid.UUID)) = r.row.familyID
	*(dest[4].(**uuid.UUID)) = r.row.replacedBySessionID
	*(dest[5].(**string)) = nil // user_agent: unused by these tests.
	*(dest[6].(**string)) = nil // ip_address: unused by these tests.
	// dest[7] created_at, dest[8] last_used_at: unused by RotateSession logic.
	*(dest[9].(*pgtype.Timestamptz)) = r.row.expiresAt
	*(dest[10].(*pgtype.Timestamptz)) = r.row.revokedAt
	return nil
}

func newTestSessionManager(store *fakeSessionStore) *SessionManager {
	return &SessionManager{store: store}
}

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
