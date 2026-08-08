package activedirectory

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/google/uuid"
)

func (s *Service) GetGroupMembers(ctx context.Context, groupID uuid.UUID) ([]database.GetGroupMembersRow, error) {
	q := database.New(s.db)
	return q.GetGroupMembers(ctx, groupID)
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

func (s *Service) updateGroupMembers(
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

	groupDN, err := s.lookupDN(ctx, group.ExternalID, "group")
	if err != nil {
		return nil, err
	}

	failed := make(map[uuid.UUID]error)

	for _, memberID := range dedupeUUIDs(memberIDs) {
		member, err := q.GetPrincipalByID(ctx, memberID)
		if err != nil {
			failed[memberID] = err
			continue
		}

		memberDN, err := s.lookupDN(ctx, member.ExternalID, string(member.PrincipalType))
		if err != nil {
			failed[memberID] = err
			continue
		}

		if add {
			err = s.client.AddGroupMember(ctx, groupDN, memberDN)
		} else {
			err = s.client.RemoveGroupMember(ctx, groupDN, memberDN)
		}
		if err != nil {
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
			continue
		}

		if err := q.DeleteGroupMembership(ctx, database.DeleteGroupMembershipParams{
			GroupID:  groupID,
			MemberID: memberID,
		}); err != nil {
			return failed, fmt.Errorf("persist removed group membership: %w", err)
		}
	}

	return failed, nil
}

func (s *Service) AddGroupMembers(
	ctx context.Context,
	groupID uuid.UUID,
	memberIDs []uuid.UUID,
) (map[uuid.UUID]error, error) {
	return s.updateGroupMembers(ctx, groupID, memberIDs, true)
}

func (s *Service) RemoveGroupMembers(
	ctx context.Context,
	groupID uuid.UUID,
	memberIDs []uuid.UUID,
) (map[uuid.UUID]error, error) {
	return s.updateGroupMembers(ctx, groupID, memberIDs, false)
}

func (s *Service) GetUserGroups(ctx context.Context, userID uuid.UUID) ([]database.GetUserGroupsRow, error) {
	q := database.New(s.db)
	return q.GetUserGroups(ctx, userID)
}

type userGroupMembershipUpdate struct {
	groupDN    string
	externalID string
	add        bool
}

func groupContainsMember(group Group, memberDN string) bool {
	for _, existingMemberDN := range group.MemberDNs {
		if strings.EqualFold(existingMemberDN, memberDN) {
			return true
		}
	}
	return false
}

func planUserGroupMembershipUpdates(
	memberDN string,
	providerGroups []Group,
	managedGroups []database.GetAllGroupsRow,
	desiredGroupIDs map[uuid.UUID]struct{},
) ([]userGroupMembershipUpdate, error) {
	providerGroupsBySID := make(map[string]Group, len(providerGroups))
	for _, group := range providerGroups {
		providerGroupsBySID[group.SID] = group
	}

	managedGroupIDs := make(map[uuid.UUID]struct{}, len(managedGroups))
	updates := make([]userGroupMembershipUpdate, 0)
	for _, managedGroup := range managedGroups {
		managedGroupIDs[managedGroup.ID] = struct{}{}
		_, shouldContainMember := desiredGroupIDs[managedGroup.ID]
		providerGroup, exists := providerGroupsBySID[managedGroup.ExternalID]
		if !exists {
			if shouldContainMember {
				return nil, fmt.Errorf("selected group %s: %w", managedGroup.ID, principals.ErrPrincipalNotFound)
			}
			continue
		}

		containsMember := groupContainsMember(providerGroup, memberDN)
		if containsMember == shouldContainMember {
			continue
		}
		updates = append(updates, userGroupMembershipUpdate{
			groupDN:    providerGroup.DN,
			externalID: managedGroup.ExternalID,
			add:        shouldContainMember,
		})
	}

	for desiredGroupID := range desiredGroupIDs {
		if _, exists := managedGroupIDs[desiredGroupID]; !exists {
			return nil, fmt.Errorf("selected group %s: %w", desiredGroupID, principals.ErrUnsupportedPrincipal)
		}
	}

	return updates, nil
}

func (s *Service) SetUserGroups(
	ctx context.Context,
	userID uuid.UUID,
	groupIDs []uuid.UUID,
) error {
	q := database.New(s.db)
	user, err := q.GetPrincipalByID(ctx, userID)
	if err != nil {
		return err
	}
	if user.PrincipalType != database.PrincipalTypeUser {
		return principals.ErrUnsupportedPrincipal
	}
	providerID, err := s.getProviderID(ctx)
	if err != nil {
		return err
	}
	if user.ProviderID != providerID {
		return principals.ErrUnsupportedPrincipal
	}

	dedupedGroupIDs := dedupeUUIDs(groupIDs)
	desiredGroupIDs := make(map[uuid.UUID]struct{}, len(dedupedGroupIDs))
	for _, groupID := range dedupedGroupIDs {
		desiredGroupIDs[groupID] = struct{}{}
	}

	managedGroups, err := q.GetAllGroups(ctx, user.ProviderID)
	if err != nil {
		return err
	}
	memberDN, err := s.lookupDN(ctx, user.ExternalID, "user")
	if err != nil {
		return err
	}
	providerGroups, err := s.client.FetchGroups(ctx)
	if err != nil {
		return err
	}
	updates, err := planUserGroupMembershipUpdates(
		memberDN,
		providerGroups,
		managedGroups,
		desiredGroupIDs,
	)
	if err != nil {
		return err
	}

	providerErrors := make([]error, 0)
	for _, update := range updates {
		if update.add {
			err = s.client.AddGroupMember(ctx, update.groupDN, memberDN)
		} else {
			err = s.client.RemoveGroupMember(ctx, update.groupDN, memberDN)
		}
		if err != nil {
			providerErrors = append(
				providerErrors,
				fmt.Errorf("update Active Directory group %s: %w", update.externalID, err),
			)
		}
	}
	if len(providerErrors) > 0 {
		return errors.Join(providerErrors...)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := principals.ReplaceStoredUserGroups(
		ctx,
		database.New(tx),
		userID,
		dedupedGroupIDs,
	); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (s *Service) TriggerSync(ctx context.Context) error {
	return s.sync.Run(ctx)
}
