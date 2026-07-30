package handlers

import (
	"context"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type VMNetworkScope struct {
	VNet    string
	VLANTag int
}

func personalPodVNetScope(personalVNet string, networkNumber int32) VMNetworkScope {
	return VMNetworkScope{
		VNet:    personalVNet,
		VLANTag: int(networkNumber),
	}
}

// personalPodNetworkScope reports whether itemID sits inside a personal pod
func personalPodNetworkScope(
	ctx context.Context,
	db *pgxpool.Pool,
	personalVNet string,
	itemID uuid.UUID,
) (scope VMNetworkScope, scoped bool, err error) {
	pod, err := database.New(db).GetPersonalPodForInventoryItem(ctx, itemID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return VMNetworkScope{}, false, nil
		}
		return VMNetworkScope{}, false, err
	}

	return personalPodVNetScope(personalVNet, pod.NetworkNumber), true, nil
}

func personalPodNetworkMismatch(scope VMNetworkScope, bridge string, vlanTag int) bool {
	return strings.TrimSpace(bridge) != scope.VNet || vlanTag != scope.VLANTag
}
