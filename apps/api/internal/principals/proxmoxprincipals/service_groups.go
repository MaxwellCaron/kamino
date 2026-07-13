package proxmoxprincipals

import (
	"context"
	"fmt"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
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
	if err := ValidateProxmoxGroupID(name); err != nil {
		return uuid.Nil, err
	}
	if err := s.client.CreateAccessGroup(ctx, name, description); err != nil {
		return uuid.Nil, err
	}
	return s.upsertCreatedPrincipal(
		ctx,
		database.PrincipalTypeGroup,
		name,
		name,
		description,
	)
}

func (s *Service) UpdateGroup(ctx context.Context, id uuid.UUID, name, description string) error {
	q := database.New(s.db)
	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		return err
	}
	if strings.TrimSpace(name) != "" && name != p.ExternalID {
		return principals.ErrUnsupportedPrincipal
	}
	if err := s.client.UpdateAccessGroup(ctx, p.ExternalID, description); err != nil {
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
	if err := s.client.DeleteAccessGroup(ctx, p.ExternalID); err != nil {
		return err
	}
	return q.DeletePrincipal(ctx, id)
}

func (s *Service) GetGroupMembers(ctx context.Context, groupID uuid.UUID) ([]database.GetGroupMembersRow, error) {
	return database.New(s.db).GetGroupMembers(ctx, groupID)
}

func dedupeUUIDs(ids []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(ids))
	deduped := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		deduped = append(deduped, id)
	}
	return deduped
}

func (s *Service) lookupAccessUser(ctx context.Context, userid string) (proxmox.AccessUser, error) {
	users, err := s.client.ListAccessUsers(ctx)
	if err != nil {
		return proxmox.AccessUser{}, err
	}
	for _, user := range users {
		if user.UserID == userid {
			return user, nil
		}
	}
	return proxmox.AccessUser{}, principals.ErrPrincipalNotFound
}

func (s *Service) updateUserGroups(
	ctx context.Context,
	groupID uuid.UUID,
	memberIDs []uuid.UUID,
	add bool,
) (map[uuid.UUID]error, error) {
	q := database.New(s.db)
	group, err := q.GetPrincipalByID(ctx, groupID)
	if err != nil {
		return nil, err
	}
	if group.PrincipalType != database.PrincipalTypeGroup {
		return nil, principals.ErrUnsupportedPrincipal
	}

	currentMembers, err := q.GetGroupMembers(ctx, groupID)
	if err != nil {
		return nil, err
	}
	currentMemberSet := make(map[uuid.UUID]struct{}, len(currentMembers))
	for _, member := range currentMembers {
		currentMemberSet[member.ID] = struct{}{}
	}

	failed := make(map[uuid.UUID]error)
	for _, memberID := range dedupeUUIDs(memberIDs) {
		_, isMember := currentMemberSet[memberID]
		if add && isMember {
			continue
		}
		if !add && !isMember {
			continue
		}

		member, err := q.GetPrincipalByID(ctx, memberID)
		if err != nil {
			failed[memberID] = err
			continue
		}
		if member.PrincipalType != database.PrincipalTypeUser {
			failed[memberID] = principals.ErrUnsupportedPrincipal
			continue
		}

		accessUser, err := s.lookupAccessUser(ctx, member.ExternalID)
		if err != nil {
			failed[memberID] = err
			continue
		}

		groups := proxmox.ParseAccessGroups(accessUser.Groups)
		if add {
			if !containsString(groups, group.ExternalID) {
				groups = append(groups, group.ExternalID)
			}
		} else {
			groups = removeString(groups, group.ExternalID)
		}

		if err := s.client.UpdateAccessUser(ctx, member.ExternalID, "", nil, groups); err != nil {
			failed[memberID] = err
			continue
		}

		if add {
			if err := q.InsertGroupMembership(ctx, database.InsertGroupMembershipParams{
				GroupID:  groupID,
				MemberID: memberID,
			}); err != nil {
				return failed, fmt.Errorf("persist added group membership: %w", err)
			}
			currentMemberSet[memberID] = struct{}{}
			continue
		}

		if err := q.DeleteGroupMembership(ctx, database.DeleteGroupMembershipParams{
			GroupID:  groupID,
			MemberID: memberID,
		}); err != nil {
			return failed, fmt.Errorf("persist removed group membership: %w", err)
		}
		delete(currentMemberSet, memberID)
	}

	return failed, nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func removeString(values []string, target string) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if value != target {
			filtered = append(filtered, value)
		}
	}
	return filtered
}

func (s *Service) AddGroupMembers(
	ctx context.Context,
	groupID uuid.UUID,
	memberIDs []uuid.UUID,
) (map[uuid.UUID]error, error) {
	return s.updateUserGroups(ctx, groupID, memberIDs, true)
}

func (s *Service) RemoveGroupMembers(
	ctx context.Context,
	groupID uuid.UUID,
	memberIDs []uuid.UUID,
) (map[uuid.UUID]error, error) {
	return s.updateUserGroups(ctx, groupID, memberIDs, false)
}

func (s *Service) GetUserGroups(ctx context.Context, userID uuid.UUID) ([]database.GetUserGroupsRow, error) {
	return database.New(s.db).GetUserGroups(ctx, userID)
}

func (s *Service) TriggerSync(ctx context.Context) error {
	return s.sync.Run(ctx)
}
