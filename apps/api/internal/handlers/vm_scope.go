package handlers

import (
	"context"
	"fmt"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func personalPodScopedVNet(prefix string, vlanBase int, n int32) string {
	return fmt.Sprintf("%s%d", strings.TrimSpace(prefix), vlanBase+int(n))
}

// personalPodNetworkScope reports whether itemID sits inside a personal pod
// and, if so, the only VNet the actor may use.
func personalPodNetworkScope(
	ctx context.Context,
	db *pgxpool.Pool,
	personalVNetPrefix string,
	vlanBase int,
	itemID uuid.UUID,
) (vnetName string, scoped bool, err error) {
	pod, err := database.New(db).GetPersonalPodForInventoryItem(ctx, itemID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", false, nil
		}
		return "", false, err
	}

	return personalPodScopedVNet(personalVNetPrefix, vlanBase, pod.NetworkNumber), true, nil
}
