package auth

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"

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
