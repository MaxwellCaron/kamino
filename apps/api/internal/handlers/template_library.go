package handlers

import (
	"context"
	"errors"
	"sort"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var errTemplateLibraryUnavailable = errors.New("configured template library does not resolve to a folder")
var errTemplateSourceOutOfScope = errors.New("source is not a direct template child of the configured template library")

type templateLibraryReader interface {
	configuredFolderReader
	GetAllInventoryItems(ctx context.Context) ([]database.GetAllInventoryItemsRow, error)
}

type templateLibraryOption struct {
	ID               uuid.UUID `json:"id"`
	Name             string    `json:"name"`
	Node             string    `json:"node"`
	VMID             int32     `json:"vmid"`
	CPUCount         *int32    `json:"cpu_count,omitempty"`
	MemoryMB         *int32    `json:"memory_mb,omitempty"`
	DiskGB           *float64  `json:"disk_gb,omitempty"`
	IsRouterTemplate bool      `json:"is_router_template"`
}

func loadTemplateLibraryOptions(
	ctx context.Context,
	reader templateLibraryReader,
	configuredFolderID uuid.UUID,
) ([]templateLibraryOption, error) {
	folderID, found, err := resolveConfiguredFolderID(ctx, reader, configuredFolderID, templatesFolderName)
	if err != nil {
		return nil, err
	}
	if !found {
		return []templateLibraryOption{}, nil
	}

	rows, err := reader.GetAllInventoryItems(ctx)
	if err != nil {
		return nil, err
	}

	options := make([]templateLibraryOption, 0)
	for _, row := range rows {
		if row.Kind != database.InventoryItemKindVm ||
			row.IsTemplate == nil || !*row.IsTemplate ||
			row.ParentID == nil || *row.ParentID != folderID ||
			row.Node == nil || row.Vmid == nil {
			continue
		}

		options = append(options, templateLibraryOption{
			ID:       row.ID,
			Name:     row.Name,
			Node:     *row.Node,
			VMID:     *row.Vmid,
			CPUCount: row.CpuCount,
			MemoryMB: row.MemoryMb,
			DiskGB:   row.DiskGb,
		})
	}

	sort.Slice(options, func(i, j int) bool {
		if options[i].Name == options[j].Name {
			return options[i].ID.String() < options[j].ID.String()
		}
		return options[i].Name < options[j].Name
	})

	return options, nil
}

func validateTemplateLibrarySource(
	ctx context.Context,
	reader configuredFolderReader,
	configuredFolderID uuid.UUID,
	sourceItemID uuid.UUID,
) error {
	folderID, found, err := resolveConfiguredFolderID(ctx, reader, configuredFolderID, templatesFolderName)
	if err != nil {
		return err
	}
	if !found {
		return errTemplateLibraryUnavailable
	}

	source, err := reader.GetInventoryItemByID(ctx, sourceItemID)
	if errors.Is(err, pgx.ErrNoRows) {
		return errTemplateSourceOutOfScope
	}
	if err != nil {
		return err
	}
	if source.Kind != database.InventoryItemKindVm ||
		source.IsTemplate == nil || !*source.IsTemplate ||
		source.ParentID == nil || *source.ParentID != folderID {
		return errTemplateSourceOutOfScope
	}

	return nil
}
