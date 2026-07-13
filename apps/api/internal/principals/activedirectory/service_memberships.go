package activedirectory

import (
	"context"
	"fmt"

	"github.com/MaxwellCaron/kamino/database"
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

func (s *Service) TriggerSync(ctx context.Context) error {
	return s.sync.Run(ctx)
}
