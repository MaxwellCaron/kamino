package activedirectory

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	db     *pgxpool.Pool
	client *Client
	sync   *Sync
}

func NewService(db *pgxpool.Pool, client *Client, sync *Sync) *Service {
	return &Service{db: db, client: client, sync: sync}
}

func (s *Service) Capabilities() principals.ProviderCapabilities {
	return principals.ProviderCapabilities{
		ProviderType:         database.PrincipalProviderTypeActiveDirectory,
		DisplayName:          "Active Directory",
		CanSync:              true,
		CanCreateUsers:       true,
		UserPasswordOnCreate: true,
		CanRenameUsers:       true,
		CanSetPasswords:      true,
		CanChangeOwnPassword: true,
		CanEnableUsers:       true,
		CanDisableUsers:      true,
		CanCreateGroups:      true,
		CanManageMemberships: true,
	}
}

func (s *Service) Authenticate(
	ctx context.Context,
	username, password string,
) (principals.AuthenticatedPrincipal, error) {
	result, err := s.client.Authenticate(ctx, username, password)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "invalid credentials") {
			return principals.AuthenticatedPrincipal{}, principals.ErrInvalidCredentials
		}
		return principals.AuthenticatedPrincipal{}, err
	}
	return principals.AuthenticatedPrincipal{
		ExternalID: result.SID,
		Username:   result.Username,
	}, nil
}

func (s *Service) getProviderID(ctx context.Context) (uuid.UUID, error) {
	q := database.New(s.db)
	id, err := q.GetPrincipalProvider(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, errors.New("no principal provider configured")
		}
		return uuid.Nil, err
	}
	return id, nil
}

func (s *Service) lookupDN(ctx context.Context, sid string, objectType string) (string, error) {
	if objectType == "user" {
		users, err := s.client.FetchUsers(ctx)
		if err != nil {
			return "", err
		}
		for _, u := range users {
			if u.SID == sid {
				return u.DN, nil
			}
		}
	} else {
		groups, err := s.client.FetchGroups(ctx)
		if err != nil {
			return "", err
		}
		for _, g := range groups {
			if g.SID == sid {
				return g.DN, nil
			}
		}
	}
	return "", principals.ErrPrincipalNotFound
}

func (s *Service) upsertCreatedPrincipal(
	ctx context.Context,
	principalType database.PrincipalType,
	externalID string,
	name string,
	description string,
	createdAt time.Time,
) (uuid.UUID, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	providerID, err := ensureProvider(ctx, q)
	if err != nil {
		return uuid.Nil, err
	}

	principalID, err := q.UpsertSyncedPrincipal(ctx, database.UpsertSyncedPrincipalParams{
		ProviderID:    providerID,
		PrincipalType: principalType,
		ExternalID:    externalID,
		Name:          &name,
		CreatedAt:     principalCreatedAtParam(createdAt),
	})
	if err != nil {
		return uuid.Nil, err
	}

	if err := q.UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
		Description: &description,
		ID:          principalID,
	}); err != nil {
		return uuid.Nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}

	return principalID, nil
}
