package handlers

import (
	"context"
	"errors"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var errPersonalPodTemplatesFolderUnavailable = errors.New("personal pod templates folder is not configured or does not resolve to a folder")
var errPersonalPodTemplateSourceOutOfScope = errors.New("source is not a direct template child of the configured personal pod templates folder")

// validatePersonalPodTemplateSource enforces that the source is a direct template child of the configured folder.
func validatePersonalPodTemplateSource(
	ctx context.Context,
	service configuredFolderReader,
	personalPodTemplatesFolderItemID uuid.UUID,
	sourceItemID uuid.UUID,
) error {
	folderID, found, err := resolveConfiguredFolderID(
		ctx, service, personalPodTemplatesFolderItemID, templatesFolderName,
	)
	if err != nil {
		return err
	}
	if !found {
		return errPersonalPodTemplatesFolderUnavailable
	}

	source, err := service.GetInventoryItemByID(ctx, sourceItemID)
	if err != nil {
		return err
	}
	if source.Kind != database.InventoryItemKindVm ||
		source.IsTemplate == nil || !*source.IsTemplate ||
		source.ParentID == nil || *source.ParentID != folderID {
		return errPersonalPodTemplateSourceOutOfScope
	}

	return nil
}

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
