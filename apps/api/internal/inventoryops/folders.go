package inventoryops

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// configuredFolderReader is the narrow inventory read seam shared by every configured-ID folder resolver.
type ConfiguredFolderReader interface {
	FindFolderPath(ctx context.Context, path []string) (uuid.UUID, bool, error)
	GetInventoryItemByID(ctx context.Context, id uuid.UUID) (database.GetInventoryItemByIDRow, error)
}

// resolveConfiguredFolderID prefers configuredID and falls back to matching fallbackName by name under the root.
func ResolveConfiguredFolderID(
	ctx context.Context,
	service ConfiguredFolderReader,
	configuredID uuid.UUID,
	fallbackName string,
) (uuid.UUID, bool, error) {
	if configuredID == uuid.Nil {
		return service.FindFolderPath(ctx, []string{fallbackName})
	}

	item, err := service.GetInventoryItemByID(ctx, configuredID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, err
	}
	if item.Kind != database.InventoryItemKindFolder {
		return uuid.Nil, false, nil
	}
	return item.ID, true, nil
}

const TemplatesFolderName = "Templates"
