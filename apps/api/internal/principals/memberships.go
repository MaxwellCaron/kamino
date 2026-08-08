package principals

import (
	"context"
	"fmt"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

// ReplaceStoredUserGroups reconciles Kamino's membership rows after the
// provider has accepted an exact user-group assignment.
func ReplaceStoredUserGroups(
	ctx context.Context,
	q *database.Queries,
	userID uuid.UUID,
	groupIDs []uuid.UUID,
) error {
	currentGroups, err := q.GetUserGroups(ctx, userID)
	if err != nil {
		return fmt.Errorf("load stored user groups: %w", err)
	}

	desired := make(map[uuid.UUID]struct{}, len(groupIDs))
	for _, groupID := range groupIDs {
		desired[groupID] = struct{}{}
	}

	for _, group := range currentGroups {
		if _, keep := desired[group.ID]; keep {
			continue
		}
		if err := q.DeleteGroupMembership(ctx, database.DeleteGroupMembershipParams{
			GroupID:  group.ID,
			MemberID: userID,
		}); err != nil {
			return fmt.Errorf("delete stored group membership: %w", err)
		}
	}

	for groupID := range desired {
		if err := q.InsertGroupMembership(ctx, database.InsertGroupMembershipParams{
			GroupID:  groupID,
			MemberID: userID,
		}); err != nil {
			return fmt.Errorf("insert stored group membership: %w", err)
		}
	}

	return nil
}
