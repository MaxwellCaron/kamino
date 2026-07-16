package inventory

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	PurposePodsFolderDescription                 = "Manager-created pod workspaces. Create pods from the Pods area; publish a finished pod to make it available in the catalog."
	PurposePersonalPodsFolderDescription         = "User-owned personal lab pods. Users request or create their personal pod from the Pods area; Kamino provisions the router and network."
	PurposeTemplatesFolderDescription            = "Source templates used when creating pods. Add Proxmox templates here so managers can include them in new pod workspaces."
	PurposePodVirtualMachinesFolderDescription   = "Working VMs for this pod. Build and test the pod here, then publish it when the workload is ready for others to clone."
	PurposePublishedPodTemplateFolderDescription = "Prepared template copies for this published pod. Kamino maintains these clones for catalog launches and reclones."
	PurposeProxmoxRootFolderDescription          = proxmox.RootFolderDescription
)

func (s *Service) CreateFolder(ctx context.Context, parentID uuid.UUID, name string) (uuid.UUID, error) {
	name = names.Normalize(name)
	if err := names.ValidateFolder(name); err != nil {
		return uuid.Nil, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	parent, err := q.GetInventoryItemForUpdate(ctx, parentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrInventoryParentNotFound
	}
	if err != nil {
		return uuid.Nil, err
	}
	if parent.Kind != database.InventoryItemKindFolder {
		return uuid.Nil, ErrInventoryTargetNotFolder
	}
	if err := ensureFolderDepthForCreate(ctx, q, parentID); err != nil {
		return uuid.Nil, err
	}

	existingID, err := q.GetChildFolderByName(ctx, database.GetChildFolderByNameParams{
		ParentID: &parentID,
		Name:     name,
	})
	switch {
	case err == nil && existingID != uuid.Nil:
		return uuid.Nil, ErrInventoryFolderConflict
	case err != nil && !errors.Is(err, pgx.ErrNoRows):
		return uuid.Nil, err
	}

	folderID, err := q.CreateChildFolder(ctx, database.CreateChildFolderParams{
		ParentID: &parentID,
		Name:     name,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return uuid.Nil, ErrInventoryFolderConflict
		}
		return uuid.Nil, err
	}

	s.notifyTx(ctx, tx, folderID)

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}

	return folderID, nil
}

func (s *Service) RenameFolder(ctx context.Context, id uuid.UUID, name string) error {
	item, err := database.New(s.db).GetInventoryItemByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInventoryFolderNotFound
	}
	if err != nil {
		return err
	}
	if item.Kind != database.InventoryItemKindFolder {
		return ErrInventoryItemNotFolder
	}

	return s.UpdateFolderDetails(ctx, id, name, item.Description)
}

func (s *Service) UpdateFolderDetails(ctx context.Context, id uuid.UUID, name string, description *string) error {
	name = names.Normalize(name)
	if err := names.ValidateFolder(name); err != nil {
		return err
	}

	normalizedDescription, err := NormalizeFolderDescription(description)
	if err != nil {
		return err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	item, err := q.GetInventoryItemForUpdate(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInventoryFolderNotFound
	}
	if err != nil {
		return err
	}
	if item.Kind != database.InventoryItemKindFolder {
		return ErrInventoryItemNotFolder
	}

	if item.ParentID != nil {
		existingID, err := q.GetChildFolderByName(ctx, database.GetChildFolderByNameParams{
			ParentID: item.ParentID,
			Name:     name,
		})
		switch {
		case err == nil && existingID != id:
			return ErrInventoryFolderConflict
		case err != nil && !errors.Is(err, pgx.ErrNoRows):
			return err
		}
	}

	if err := q.UpdateInventoryFolderDetails(ctx, database.UpdateInventoryFolderDetailsParams{
		Name:        name,
		Description: normalizedDescription,
		ID:          id,
	}); err != nil {
		if isUniqueViolation(err) {
			return ErrInventoryFolderConflict
		}
		return err
	}

	s.notifyTx(ctx, tx, id)

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	return nil
}

func (s *Service) SetFolderDescription(ctx context.Context, id uuid.UUID, description string) error {
	normalizedDescription, err := NormalizeFolderDescription(&description)
	if err != nil {
		return err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	item, err := q.GetInventoryItemForUpdate(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInventoryFolderNotFound
	}
	if err != nil {
		return err
	}
	if item.Kind != database.InventoryItemKindFolder {
		return ErrInventoryItemNotFolder
	}

	if err := q.UpdateInventoryFolderDescription(ctx, database.UpdateInventoryFolderDescriptionParams{
		Description: normalizedDescription,
		ID:          id,
	}); err != nil {
		return err
	}

	s.notifyTx(ctx, tx, id)

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	return nil
}
