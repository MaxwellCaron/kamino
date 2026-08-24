package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/observability"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInvalidSession = errors.New("invalid session")
var ErrRefreshCollision = errors.New("refresh collision")

const (
	sessionCleanupInterval    = 24 * time.Hour
	sessionCleanupGracePeriod = 24 * time.Hour
	minimumRefreshRotationAge = 5 * time.Minute
	refreshCollisionWindow    = 5 * time.Second
)

// sessionStore is the seam SessionManager uses to talk to the database
type sessionStore interface {
	database.DBTX
	BeginTx(ctx context.Context, opts pgx.TxOptions) (pgx.Tx, error)
}

type SessionManager struct {
	store sessionStore
	tel   *observability.Telemetry
}

func NewSessionManager(db *pgxpool.Pool, tel *observability.Telemetry) *SessionManager {
	return &SessionManager{store: db, tel: tel}
}

type Session struct {
	ID          uuid.UUID
	PrincipalID uuid.UUID
	ExpiresAt   time.Time
}

func (m *SessionManager) CreateSession(
	ctx context.Context,
	principalID uuid.UUID,
	userAgent string,
	ipAddress string,
) (rawToken string, session Session, err error) {
	rawToken, tokenHash, err := generateOpaqueToken()
	if err != nil {
		return "", Session{}, err
	}

	now := time.Now().UTC()
	session = Session{
		ID:          uuid.New(),
		PrincipalID: principalID,
		ExpiresAt:   now.Add(RefreshTokenDuration),
	}

	q := database.New(m.store)
	if err := q.CreateAuthSession(ctx, database.CreateAuthSessionParams{
		ID:          session.ID,
		PrincipalID: session.PrincipalID,
		TokenHash:   tokenHash,
		FamilyID:    session.ID,
		UserAgent:   optionalText(userAgent),
		IpAddress:   optionalText(ipAddress),
		ExpiresAt:   timestamptz(session.ExpiresAt),
	}); err != nil {
		return "", Session{}, fmt.Errorf("create auth session: %w", err)
	}

	return rawToken, session, nil
}

// RefreshSession touches a young token in place, rotates an older one, and revokes the family on any non-collision replay.
func (m *SessionManager) RefreshSession(
	ctx context.Context,
	rawToken string,
	userAgent string,
	ipAddress string,
) (newToken string, session Session, err error) {
	tokenHash := hashOpaqueToken(rawToken)

	tx, err := m.store.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", Session{}, fmt.Errorf("begin auth session tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	q := database.New(tx)
	current, err := q.GetAuthSessionByTokenHashForUpdate(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", Session{}, ErrInvalidSession
		}
		return "", Session{}, fmt.Errorf("load auth session: %w", err)
	}

	now := time.Now().UTC()
	if !current.RevokedAt.Valid && current.ExpiresAt.Valid && now.After(current.ExpiresAt.Time) {
		if _, revokeErr := q.RevokeAuthSessionFamily(ctx, current.FamilyID); revokeErr != nil {
			return "", Session{}, fmt.Errorf("revoke expired auth session family: %w", revokeErr)
		}
		if err := tx.Commit(ctx); err != nil {
			return "", Session{}, fmt.Errorf("commit expired auth session family revoke: %w", err)
		}
		return "", Session{}, ErrInvalidSession
	}
	if current.RevokedAt.Valid {
		if current.ReplacedBySessionID != nil && isRefreshCollision(current, now, userAgent, ipAddress) {
			if err := tx.Commit(ctx); err != nil {
				return "", Session{}, fmt.Errorf("commit refresh collision: %w", err)
			}
			return "", Session{}, ErrRefreshCollision
		}

		if _, revokeErr := q.RevokeAuthSessionFamily(ctx, current.FamilyID); revokeErr != nil {
			return "", Session{}, fmt.Errorf("revoke replayed auth session family: %w", revokeErr)
		}
		if err := tx.Commit(ctx); err != nil {
			return "", Session{}, fmt.Errorf("commit replayed auth session family revoke: %w", err)
		}
		return "", Session{}, ErrInvalidSession
	}

	if current.CreatedAt.Valid && now.Sub(current.CreatedAt.Time) < minimumRefreshRotationAge {
		if err := q.UpdateAuthSessionLastUsed(ctx, current.ID); err != nil {
			return "", Session{}, fmt.Errorf("touch auth session: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return "", Session{}, fmt.Errorf("commit auth session touch: %w", err)
		}
		return rawToken, Session{
			ID:          current.ID,
			PrincipalID: current.PrincipalID,
			ExpiresAt:   current.ExpiresAt.Time,
		}, nil
	}

	newToken, newHash, err := generateOpaqueToken()
	if err != nil {
		return "", Session{}, err
	}

	session = Session{
		ID:          uuid.New(),
		PrincipalID: current.PrincipalID,
		ExpiresAt:   now.Add(RefreshTokenDuration),
	}

	if err := q.CreateAuthSession(ctx, database.CreateAuthSessionParams{
		ID:          session.ID,
		PrincipalID: session.PrincipalID,
		TokenHash:   newHash,
		FamilyID:    current.FamilyID,
		UserAgent:   optionalText(userAgent),
		IpAddress:   optionalText(ipAddress),
		ExpiresAt:   timestamptz(session.ExpiresAt),
	}); err != nil {
		return "", Session{}, fmt.Errorf("create rotated auth session: %w", err)
	}

	// Fingerprint the predecessor with this request's UA/IP, not its original issuance metadata.
	if err := q.RotateAuthSession(ctx, database.RotateAuthSessionParams{
		ID:                  current.ID,
		ReplacedBySessionID: &session.ID,
		UserAgent:           optionalText(userAgent),
		IpAddress:           optionalText(ipAddress),
	}); err != nil {
		return "", Session{}, fmt.Errorf("rotate auth session: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", Session{}, fmt.Errorf("commit auth session rotation: %w", err)
	}

	return newToken, session, nil
}

// isRefreshCollision reports whether a replay looks like a same-client race rather than a stolen-token reuse.
func isRefreshCollision(current database.AuthSessions, now time.Time, userAgent, ipAddress string) bool {
	if !current.RevokedAt.Valid || now.Sub(current.RevokedAt.Time) > refreshCollisionWindow {
		return false
	}

	var storedUserAgent, storedIPAddress string
	if current.UserAgent != nil {
		storedUserAgent = *current.UserAgent
	}
	if current.IpAddress != nil {
		storedIPAddress = *current.IpAddress
	}

	return storedUserAgent == strings.TrimSpace(userAgent) &&
		storedIPAddress == strings.TrimSpace(ipAddress)
}

func (m *SessionManager) RevokeSession(ctx context.Context, rawToken string) error {
	tokenHash := hashOpaqueToken(rawToken)

	tx, err := m.store.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin auth session revoke tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	q := database.New(tx)
	session, err := q.GetAuthSessionByTokenHashForUpdate(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("load auth session for revoke: %w", err)
	}

	if err := q.RevokeAuthSession(ctx, session.ID); err != nil {
		return fmt.Errorf("revoke auth session: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit auth session revoke: %w", err)
	}

	return nil
}

func (m *SessionManager) ValidateAccessSession(
	ctx context.Context,
	sessionID uuid.UUID,
	principalID uuid.UUID,
) error {
	q := database.New(m.store)
	active, err := q.IsAuthSessionActive(ctx, database.IsAuthSessionActiveParams{
		ID:          sessionID,
		PrincipalID: principalID,
	})
	if err != nil {
		return fmt.Errorf("validate auth session: %w", err)
	}
	if !active {
		return ErrInvalidSession
	}
	return nil
}

// ValidateLiveSession reports whether sessionID's family still has an active member for principalID.
func (m *SessionManager) ValidateLiveSession(
	ctx context.Context,
	sessionID uuid.UUID,
	principalID uuid.UUID,
) error {
	q := database.New(m.store)
	active, err := q.IsAuthSessionFamilyActiveForSession(ctx, database.IsAuthSessionFamilyActiveForSessionParams{
		ID:          sessionID,
		PrincipalID: principalID,
	})
	if err != nil {
		return fmt.Errorf("validate live auth session: %w", err)
	}
	if !active {
		return ErrInvalidSession
	}
	return nil
}

func (m *SessionManager) RevokePrincipalSessions(ctx context.Context, principalID uuid.UUID) error {
	q := database.New(m.store)
	if _, err := q.RevokeAuthSessionsForPrincipal(ctx, principalID); err != nil {
		return fmt.Errorf("revoke auth sessions for principal: %w", err)
	}
	return nil
}

// DeleteExpiredSessions deletes individual rows whose expiry is more than gracePeriod in the past, regardless of sibling rows in the same family.
func (m *SessionManager) DeleteExpiredSessions(ctx context.Context, gracePeriod time.Duration) (int64, error) {
	expiredBefore := time.Now().UTC().Add(-gracePeriod)
	q := database.New(m.store)
	deleted, err := q.DeleteExpiredAuthSessions(ctx, timestamptz(expiredBefore))
	if err != nil {
		return 0, fmt.Errorf("delete expired auth sessions: %w", err)
	}
	return deleted, nil
}

// StartCleanup runs the expired-session sweep immediately, then once per sessionCleanupInterval until ctx is canceled.
func (m *SessionManager) StartCleanup(ctx context.Context) {
	m.startCleanup(ctx, sessionCleanupInterval, sessionCleanupGracePeriod)
}

func (m *SessionManager) startCleanup(ctx context.Context, interval, gracePeriod time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	m.runCleanupSweep(ctx, gracePeriod)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.runCleanupSweep(ctx, gracePeriod)
		}
	}
}

func (m *SessionManager) runCleanupSweep(ctx context.Context, gracePeriod time.Duration) {
	_ = observability.RunBackgroundJob(ctx, m.tel, observability.JobSessionCleanup, func(jobCtx context.Context) error {
		deleted, err := m.DeleteExpiredSessions(jobCtx, gracePeriod)
		if err != nil {
			return err
		}
		if deleted > 0 {
			slog.InfoContext(jobCtx, "auth session cleanup sweep deleted expired sessions", slog.Int64("deleted", deleted))
		}
		return nil
	})
}

func generateOpaqueToken() (rawToken string, tokenHash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("generate opaque token: %w", err)
	}

	rawToken = base64.RawURLEncoding.EncodeToString(buf)
	return rawToken, hashOpaqueToken(rawToken), nil
}

func hashOpaqueToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}

func timestamptz(value time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: value, Valid: true}
}

func optionalText(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
