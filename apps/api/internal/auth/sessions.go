package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInvalidSession = errors.New("invalid session")

type SessionManager struct {
	db *pgxpool.Pool
}

func NewSessionManager(db *pgxpool.Pool) *SessionManager {
	return &SessionManager{db: db}
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

	q := database.New(m.db)
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

func (m *SessionManager) RotateSession(
	ctx context.Context,
	rawToken string,
	userAgent string,
	ipAddress string,
) (newToken string, session Session, err error) {
	tokenHash := hashOpaqueToken(rawToken)

	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{})
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
		if current.ReplacedBySessionID != nil {
			if err := tx.Commit(ctx); err != nil {
				return "", Session{}, fmt.Errorf("commit rotated auth session replay: %w", err)
			}
			return "", Session{}, ErrInvalidSession
		}

		if _, revokeErr := q.RevokeAuthSessionFamily(ctx, current.FamilyID); revokeErr != nil {
			return "", Session{}, fmt.Errorf("revoke replayed auth session family: %w", revokeErr)
		}
		if err := tx.Commit(ctx); err != nil {
			return "", Session{}, fmt.Errorf("commit replayed auth session family revoke: %w", err)
		}
		return "", Session{}, ErrInvalidSession
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

	if err := q.RotateAuthSession(ctx, database.RotateAuthSessionParams{
		ID:                  current.ID,
		ReplacedBySessionID: &session.ID,
	}); err != nil {
		return "", Session{}, fmt.Errorf("rotate auth session: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", Session{}, fmt.Errorf("commit auth session rotation: %w", err)
	}

	return newToken, session, nil
}

func (m *SessionManager) RevokeSession(ctx context.Context, rawToken string) error {
	tokenHash := hashOpaqueToken(rawToken)

	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{})
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
