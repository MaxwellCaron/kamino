package activedirectory

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/google/uuid"
)

func (s *Service) ListGroups(ctx context.Context) ([]database.GetAllGroupsRow, error) {
	providerID, err := s.getProviderID(ctx)
	if err != nil {
		return nil, err
	}
	return database.New(s.db).GetAllGroups(ctx, providerID)
}

func (s *Service) CreateGroup(ctx context.Context, name, description string) (uuid.UUID, error) {
	if err := ValidateADCreateName(name); err != nil {
		return uuid.Nil, err
	}

	createdGroup, err := s.client.CreateGroup(ctx, name)
	if err != nil {
		return uuid.Nil, err
	}

	return s.upsertCreatedPrincipal(
		ctx,
		database.PrincipalTypeGroup,
		createdGroup.SID,
		createdGroup.Name,
		description,
		createdGroup.CreatedAt,
	)
}

func (s *Service) UpdateGroup(ctx context.Context, id uuid.UUID, name, description string) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}

	dn, err := s.lookupDN(ctx, p.ExternalID, "group")
	if err != nil {
		return err
	}

	if err := s.client.UpdateGroup(ctx, dn, name); err != nil {
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
		Name:          &name,
	})
	if err != nil {
		return err
	}

	return q.UpdatePrincipalDescription(ctx, database.UpdatePrincipalDescriptionParams{
		Description: &description,
		ID:          id,
	})
}

func (s *Service) DeleteGroup(ctx context.Context, id uuid.UUID) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}
	if p.PrincipalType != database.PrincipalTypeGroup {
		return principals.ErrUnsupportedPrincipal
	}
	if err := principals.EnsurePrincipalDeletable(ctx, q, id); err != nil {
		return err
	}

	dn, err := s.lookupDN(ctx, p.ExternalID, "group")
	if err != nil {
		if errors.Is(err, principals.ErrPrincipalNotFound) {
			return q.DeletePrincipal(ctx, id)
		}
		return err
	}

	if err := s.client.DeleteGroup(ctx, dn); err != nil {
		return err
	}

	return q.DeletePrincipal(ctx, id)
}
