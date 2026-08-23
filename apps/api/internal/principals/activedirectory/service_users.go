package activedirectory

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) ListUsers(ctx context.Context) ([]database.GetAllUsersRow, error) {
	providerID, err := s.getProviderID(ctx)
	if err != nil {
		return nil, err
	}
	return database.New(s.db).GetAllUsers(ctx, providerID)
}

func (s *Service) CreateUser(ctx context.Context, username, password, description string) (uuid.UUID, error) {
	if err := ValidateADCreateName(username); err != nil {
		return uuid.Nil, err
	}
	if strings.TrimSpace(password) == "" {
		return uuid.Nil, fmt.Errorf("password is required")
	}

	createdUser, err := s.client.CreateUser(ctx, username, password, description)
	if err != nil {
		return uuid.Nil, err
	}

	return s.upsertCreatedPrincipal(
		ctx,
		database.PrincipalTypeUser,
		createdUser.SID,
		createdUser.Username,
		description,
		createdUser.CreatedAt,
	)
}

func (s *Service) UpdateUser(ctx context.Context, id uuid.UUID, username, fullName, description string) error {
	normalizedFullName, err := principals.NormalizeFullName(fullName)
	if err != nil {
		return err
	}

	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(ctx, p.ExternalID, "user")
	if err != nil {
		return err
	}

	if err := s.client.UpdateUser(ctx, dn, username, normalizedFullName, description); err != nil {
		return err
	}

	providerID, err := s.getProviderID(ctx)
	if err != nil {
		return err
	}

	_, err = q.UpsertPrincipal(ctx, database.UpsertPrincipalParams{
		ProviderID:    providerID,
		PrincipalType: p.PrincipalType,
		ExternalID:    p.ExternalID,
		Name:          &username,
	})
	if err != nil {
		return err
	}

	if err := q.UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
		Description: &description,
		ID:          id,
	}); err != nil {
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
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(ctx, p.ExternalID, "user")
	if err != nil {
		return err
	}

	return s.client.SetPassword(ctx, dn, password)
}

func (s *Service) ChangePassword(
	ctx context.Context,
	id uuid.UUID,
	oldPassword, newPassword string,
) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return principals.ErrPrincipalNotFound
		}
		return err
	}
	if p.PrincipalType != database.PrincipalTypeUser {
		return principals.ErrUnsupportedPrincipal
	}

	dn, err := s.lookupDN(ctx, p.ExternalID, "user")
	if err != nil {
		return principals.ErrPrincipalNotFound
	}

	if err := s.client.AuthenticateDN(ctx, dn, oldPassword); err != nil {
		return principals.ErrInvalidCredentials
	}

	return s.client.SetPassword(ctx, dn, newPassword)
}

func (s *Service) EnableUser(ctx context.Context, id uuid.UUID) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(ctx, p.ExternalID, "user")
	if err != nil {
		return err
	}

	return s.client.EnableUser(ctx, dn)
}

func (s *Service) DisableUser(ctx context.Context, id uuid.UUID) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(ctx, p.ExternalID, "user")
	if err != nil {
		return err
	}

	return s.client.DisableUser(ctx, dn)
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

	dn, err := s.lookupDN(ctx, p.ExternalID, "user")
	if err != nil {
		if errors.Is(err, principals.ErrPrincipalNotFound) {
			return q.DeletePrincipal(ctx, id)
		}
		return err
	}

	if err := s.client.DeleteUser(ctx, dn); err != nil {
		return err
	}

	return q.DeletePrincipal(ctx, id)
}
