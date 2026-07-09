package principals

import (
	"context"
	"fmt"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

func EnsurePrincipalDeletable(ctx context.Context, q *database.Queries, id uuid.UUID) error {
	blockers, err := q.ListPrincipalDeletionBlockers(ctx, id)
	if err != nil {
		return err
	}
	if len(blockers) == 0 {
		return nil
	}

	blocker := blockers[0]
	return fmt.Errorf(
		"%w: %s %q references this principal",
		ErrPrincipalInUse,
		blocker.BlockerType,
		blocker.BlockerName,
	)
}
