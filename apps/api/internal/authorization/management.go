package authorization

import (
	"context"
	"errors"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

type GroupManagementPermissions struct {
	CanEditBootstrapOnly bool
	EffectiveGrants      []ManagementPermission
	Grants               []ManagementPermission
	Immutable            bool
}

func (s *Service) GetManagementPermissionsForGroup(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
	groupID uuid.UUID,
) (GroupManagementPermissions, error) {
	if err := s.requireGroupPrincipal(ctx, groupID); err != nil {
		return GroupManagementPermissions{}, err
	}

	actorHasProtectedAccess, err := s.HasProtectedAccess(ctx, actorPrincipalID)
	if err != nil {
		return GroupManagementPermissions{}, err
	}

	if s.IsProtectedManagementGroup(groupID) {
		directGrants := []ManagementPermission{ManagementPermissionAdministrator}
		effectiveGrants, err := ExpandEffectiveManagementPermissions(directGrants)
		if err != nil {
			return GroupManagementPermissions{}, err
		}

		return GroupManagementPermissions{
			CanEditBootstrapOnly: actorHasProtectedAccess,
			EffectiveGrants:      effectiveGrants,
			Grants:               directGrants,
			Immutable:            true,
		}, nil
	}

	keys, err := database.New(s.db).ListManagementPermissionGrantsForGroup(ctx, groupID)
	if err != nil {
		return GroupManagementPermissions{}, err
	}

	grants := make([]ManagementPermission, 0, len(keys))
	for _, key := range keys {
		grants = append(grants, ManagementPermission(key))
	}

	directGrants, err := NormalizeDirectManagementPermissions(grants)
	if err != nil {
		return GroupManagementPermissions{}, err
	}
	effectiveGrants, err := ExpandEffectiveManagementPermissions(directGrants)
	if err != nil {
		return GroupManagementPermissions{}, err
	}

	return GroupManagementPermissions{
		CanEditBootstrapOnly: actorHasProtectedAccess,
		EffectiveGrants:      effectiveGrants,
		Grants:               directGrants,
		Immutable:            false,
	}, nil
}

func (s *Service) SetManagementPermissionsForGroup(
	ctx context.Context,
	actorPrincipalID uuid.UUID,
	groupID uuid.UUID,
	permissions []ManagementPermission,
) error {
	if err := s.requireGroupPrincipal(ctx, groupID); err != nil {
		return err
	}
	if s.IsProtectedManagementGroup(groupID) {
		return ErrForbidden
	}

	directGrants, err := NormalizeDirectManagementPermissions(permissions)
	if err != nil {
		return err
	}

	actorHasProtectedAccess, err := s.HasProtectedAccess(ctx, actorPrincipalID)
	if err != nil {
		return err
	}
	if !actorHasProtectedAccess {
		return ErrForbidden
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	txq := database.New(tx)
	if err := txq.DeleteManagementPermissionGrantsForGroup(ctx, groupID); err != nil {
		return err
	}

	for _, permission := range directGrants {
		if err := txq.CreateManagementPermissionGrant(ctx, database.CreateManagementPermissionGrantParams{
			GroupPrincipalID: groupID,
			PermissionKey:    string(permission),
		}); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (s *Service) HasProtectedAccess(
	ctx context.Context,
	principalID uuid.UUID,
) (bool, error) {
	return HasProtectedPrincipalAccess(ctx, s.db, principalID, s.protectedManagementGroupIDs)
}

func (s *Service) IsProtectedManagementGroup(principalID uuid.UUID) bool {
	_, ok := s.protectedManagementGroupIDs[principalID]
	return ok
}

func (s *Service) requireGroupPrincipal(ctx context.Context, principalID uuid.UUID) error {
	principal, err := database.New(s.db).GetPrincipalByID(ctx, principalID)
	if err != nil {
		return err
	}
	if principal.PrincipalType != database.PrincipalTypeGroup {
		return ErrManagementACLRequiresGroup
	}

	return nil
}

func normalizeGroupNames(values []string) []string {
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}

	return normalized
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func IsForbidden(err error) bool {
	return errors.Is(err, ErrForbidden)
}

func IsManagementACLRequiresGroup(err error) bool {
	return errors.Is(err, ErrManagementACLRequiresGroup)
}
