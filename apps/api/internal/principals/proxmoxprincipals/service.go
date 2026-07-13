package proxmoxprincipals

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type accessClient interface {
	AuthenticateTicket(ctx context.Context, username, password, defaultRealm string) (proxmox.TicketAuthResult, error)
	ListAccessUsers(ctx context.Context) ([]proxmox.AccessUser, error)
	ListAccessGroups(ctx context.Context) ([]proxmox.AccessGroup, error)
	CreateAccessUser(ctx context.Context, userid, comment string, enabled bool) error
	UpdateAccessUser(ctx context.Context, userid, comment string, enabled *bool, groups []string) error
	DeleteAccessUser(ctx context.Context, userid string) error
	CreateAccessGroup(ctx context.Context, groupid, comment string) error
	UpdateAccessGroup(ctx context.Context, groupid, comment string) error
	DeleteAccessGroup(ctx context.Context, groupid string) error
}

type Service struct {
	db               *pgxpool.Pool
	client           accessClient
	defaultRealm     string
	managedUserRealm string
	sync             *Sync
}

func NewService(
	db *pgxpool.Pool,
	client *proxmox.Client,
	defaultRealm, managedUserRealm string,
) *Service {
	if strings.TrimSpace(managedUserRealm) == "" {
		managedUserRealm = defaultRealm
	}
	service := &Service{
		db:               db,
		client:           client,
		defaultRealm:     strings.TrimSpace(defaultRealm),
		managedUserRealm: strings.TrimSpace(managedUserRealm),
	}
	service.sync = NewSync(db, client)
	return service
}

func (s *Service) Capabilities() principals.ProviderCapabilities {
	return principals.ProviderCapabilities{
		ProviderType:         database.PrincipalProviderTypeProxmox,
		DisplayName:          "Proxmox",
		CanSync:              true,
		CanCreateUsers:       true,
		UserPasswordOnCreate: false,
		CanRenameUsers:       false,
		CanSetPasswords:      false,
		CanChangeOwnPassword: false,
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
	result, err := s.client.AuthenticateTicket(ctx, username, password, s.defaultRealm)
	if err != nil {
		return principals.AuthenticatedPrincipal{}, err
	}
	return principals.AuthenticatedPrincipal{
		ExternalID: result.UserID,
		Username:   result.UserID,
	}, nil
}

func (s *Service) getProviderID(ctx context.Context) (uuid.UUID, error) {
	q := database.New(s.db)
	id, err := q.GetPrincipalProviderByType(ctx, database.PrincipalProviderTypeProxmox)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, errors.New("no Proxmox principal provider configured")
		}
		return uuid.Nil, err
	}
	return id, nil
}

func (s *Service) upsertCreatedPrincipal(
	ctx context.Context,
	principalType database.PrincipalType,
	externalID string,
	name string,
	description string,
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
		CreatedAt:     principalCreatedAtParam(time.Now().UTC()),
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

func (s *Service) ListUsers(ctx context.Context) ([]database.GetAllUsersRow, error) {
	providerID, err := s.getProviderID(ctx)
	if err != nil {
		return nil, err
	}
	return database.New(s.db).GetAllUsers(ctx, providerID)
}

func (s *Service) CreateUser(ctx context.Context, username, password, description string) (uuid.UUID, error) {
	_ = password
	userID := normalizeManagedUserID(username, s.managedUserRealm)
	if err := ValidateProxmoxUserID(userID); err != nil {
		return uuid.Nil, err
	}

	if err := s.client.CreateAccessUser(ctx, userID, description, true); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "password") {
			return uuid.Nil, fmt.Errorf(
				"proxmox requires password management for this realm; create the user in Proxmox instead",
			)
		}
		return uuid.Nil, err
	}

	return s.upsertCreatedPrincipal(
		ctx,
		database.PrincipalTypeUser,
		userID,
		userID,
		description,
	)
}

func (s *Service) UpdateUser(
	ctx context.Context,
	id uuid.UUID,
	username, fullName, description string,
) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	currentName := ""
	if p.Name != nil {
		currentName = *p.Name
	}
	trimmedUsername := strings.TrimSpace(username)
	if trimmedUsername != "" && trimmedUsername != currentName && trimmedUsername != p.ExternalID {
		return principals.ErrUnsupportedPrincipal
	}

	if err := s.client.UpdateAccessUser(ctx, p.ExternalID, description, nil, nil); err != nil {
		return err
	}

	if err := q.UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
		Description: &description,
		ID:          id,
	}); err != nil {
		return err
	}

	normalizedFullName, err := principals.NormalizeFullName(fullName)
	if err != nil {
		return err
	}
	var fullNameValue *string
	if normalizedFullName != "" {
		fullNameValue = &normalizedFullName
	}
	return q.UpdatePrincipalFullName(ctx, database.UpdatePrincipalFullNameParams{
		FullName: fullNameValue,
		ID:       id,
	})
}

func (s *Service) SetPassword(ctx context.Context, id uuid.UUID, password string) error {
	_ = ctx
	_ = id
	_ = password
	return principals.ErrUnsupportedPrincipal
}

func (s *Service) ChangePassword(
	ctx context.Context,
	id uuid.UUID,
	oldPassword, newPassword string,
) error {
	_ = ctx
	_ = id
	_ = oldPassword
	_ = newPassword
	return principals.ErrUnsupportedPrincipal
}

func (s *Service) EnableUser(ctx context.Context, id uuid.UUID) error {
	return s.setUserEnabled(ctx, id, true)
}

func (s *Service) DisableUser(ctx context.Context, id uuid.UUID) error {
	return s.setUserEnabled(ctx, id, false)
}

func (s *Service) setUserEnabled(ctx context.Context, id uuid.UUID, enabled bool) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}
	if p.PrincipalType != database.PrincipalTypeUser {
		return principals.ErrUnsupportedPrincipal
	}

	if err := s.client.UpdateAccessUser(ctx, p.ExternalID, "", &enabled, nil); err != nil {
		return err
	}
	return nil
}

func (s *Service) DeleteUser(ctx context.Context, id uuid.UUID) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}
	if p.PrincipalType != database.PrincipalTypeUser {
		return principals.ErrUnsupportedPrincipal
	}
	if err := principals.EnsurePrincipalDeletable(ctx, q, id); err != nil {
		return err
	}

	if err := s.client.DeleteAccessUser(ctx, p.ExternalID); err != nil {
		return err
	}
	return q.DeletePrincipal(ctx, id)
}
