package proxmox

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// InventoryImporter syncs Proxmox pools and VMs into the inventory database.
type InventoryImporter struct {
	db     *pgxpool.Pool
	client *Client
}

const (
	singleVMSyncTimeout      = 15 * time.Second
	singleVMSyncPollInterval = 1 * time.Second
)

func NewInventoryImporter(db *pgxpool.Pool, client *Client) *InventoryImporter {
	return &InventoryImporter{db: db, client: client}
}

// SyncVM waits for a specific VM config to become available in Proxmox, then
// persists its current metadata into the inventory database.
func (s *InventoryImporter) SyncVM(
	ctx context.Context,
	parentID uuid.UUID,
	node string,
	vmid int,
	gt GuestType,
) (uuid.UUID, error) {
	syncCtx, cancel := context.WithTimeout(ctx, singleVMSyncTimeout)
	defer cancel()

	summary, err := s.waitForVMConfigSummary(syncCtx, gt, node, vmid)
	if err != nil {
		return uuid.Nil, err
	}

	if err := s.syncVMConfigSummaryInTx(syncCtx, parentID, node, vmid, gt, summary); err != nil {
		return uuid.Nil, err
	}

	row, err := database.New(s.db).GetProxmoxVMByUpstreamUUID(syncCtx, summary.UpstreamUUID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("loading synced vm %d on node %s: %w", vmid, node, err)
	}

	return row.InventoryItemID, nil
}

func ensureFolderPath(ctx context.Context, q *database.Queries, rootID uuid.UUID, path []string) (uuid.UUID, error) {
	currentID := rootID
	for _, segment := range path {
		if segment == "" {
			continue
		}

		nextID, err := ensureChildFolder(ctx, q, currentID, segment)
		if err != nil {
			return uuid.Nil, err
		}
		currentID = nextID
	}

	return currentID, nil
}

func ensureChildFolder(ctx context.Context, q *database.Queries, parentID uuid.UUID, name string) (uuid.UUID, error) {
	id, err := q.GetChildFolderByName(ctx, database.GetChildFolderByNameParams{
		ParentID: &parentID,
		Name:     name,
	})
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	return q.CreateChildFolder(ctx, database.CreateChildFolderParams{
		ParentID: &parentID,
		Name:     name,
	})
}

func ensureRootFolder(ctx context.Context, q *database.Queries) (uuid.UUID, error) {
	rows, err := q.GetAllInventoryItems(ctx)
	if err != nil {
		return uuid.Nil, err
	}

	if rootID := FindManagedRootFolderID(rows); rootID != nil {
		return *rootID, nil
	}

	id, err := q.CreateRootFolder(ctx, proxmoxRootFolderName)
	if err != nil {
		return uuid.Nil, err
	}

	if err := q.UpdateInventoryFolderDescription(ctx, database.UpdateInventoryFolderDescriptionParams{
		Description: new(RootFolderDescription),
		ID:          id,
	}); err != nil {
		return uuid.Nil, err
	}

	return id, nil
}

func (s *InventoryImporter) syncVMConfigSummaryInTx(
	ctx context.Context,
	parentID uuid.UUID,
	node string,
	vmid int,
	gt GuestType,
	summary *VMConfigSummary,
) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning sync tx for vm %d on node %s: %w", vmid, node, err)
	}
	defer tx.Rollback(ctx)

	q := database.New(s.db).WithTx(tx)
	if err := syncVMConfigSummary(ctx, q, parentID, node, vmid, gt, summary); err != nil {
		return fmt.Errorf("syncing vm %d on node %s: %w", vmid, node, err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing sync for vm %d on node %s: %w", vmid, node, err)
	}

	return nil
}

func syncVMConfigSummary(
	ctx context.Context,
	q *database.Queries,
	parentID uuid.UUID,
	node string,
	vmid int,
	gt GuestType,
	summary *VMConfigSummary,
) error {
	if summary == nil {
		return fmt.Errorf("vm config summary is required")
	}

	existingByUUID, err := q.GetProxmoxVMByUpstreamUUID(ctx, summary.UpstreamUUID)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		existingByUUID = database.GetProxmoxVMByUpstreamUUIDRow{}
	default:
		return fmt.Errorf("looking up VM by upstream uuid: %w", err)
	}

	existingByLocator, err := q.GetProxmoxVMByNodeVMID(ctx, database.GetProxmoxVMByNodeVMIDParams{
		Node: node,
		Vmid: int32(vmid),
	})
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		existingByLocator = database.GetProxmoxVMByNodeVMIDRow{}
	default:
		return fmt.Errorf("looking up VM by node/vmid: %w", err)
	}

	if existingByUUID.InventoryItemID != uuid.Nil && existingByLocator.InventoryItemID != uuid.Nil &&
		existingByUUID.InventoryItemID != existingByLocator.InventoryItemID {
		if err := removeStaleInventoryItemForReusedLocator(ctx, q, existingByLocator.InventoryItemID, node, vmid); err != nil {
			return err
		}
		existingByLocator = database.GetProxmoxVMByNodeVMIDRow{}
	}

	if existingByUUID.InventoryItemID == uuid.Nil && existingByLocator.InventoryItemID != uuid.Nil &&
		existingByLocator.UpstreamUuid != summary.UpstreamUUID {
		if err := removeStaleInventoryItemForReusedLocator(ctx, q, existingByLocator.InventoryItemID, node, vmid); err != nil {
			return err
		}
		existingByLocator = database.GetProxmoxVMByNodeVMIDRow{}
	}

	if existingByUUID.InventoryItemID == uuid.Nil && existingByLocator.InventoryItemID == uuid.Nil {
		itemID, err := q.CreateVMItem(ctx, database.CreateVMItemParams{
			ParentID: &parentID,
			Name:     summary.Name,
		})
		if err != nil {
			return fmt.Errorf("creating inventory item: %w", err)
		}

		if err := q.InsertProxmoxVM(ctx, database.InsertProxmoxVMParams{
			InventoryItemID: itemID,
			Node:            node,
			Vmid:            int32(vmid),
			GuestType:       string(gt),
			UpstreamUuid:    summary.UpstreamUUID,
			IsTemplate:      summary.IsTemplate,
			CpuCount:        &summary.CPUCount,
			MemoryMb:        &summary.MemoryMB,
			DiskGb:          &summary.DiskGB,
		}); err != nil {
			return fmt.Errorf("inserting proxmox_vms: %w", err)
		}

		return applyImportedVMNotes(ctx, q, itemID, summary.Notes)
	}

	existing := existingByUUID
	if existing.InventoryItemID == uuid.Nil {
		existing = database.GetProxmoxVMByUpstreamUUIDRow{
			InventoryItemID: existingByLocator.InventoryItemID,
			Node:            existingByLocator.Node,
			Vmid:            existingByLocator.Vmid,
			UpstreamUuid:    existingByLocator.UpstreamUuid,
			CpuCount:        existingByLocator.CpuCount,
			MemoryMb:        existingByLocator.MemoryMb,
			DiskGb:          existingByLocator.DiskGb,
			ParentID:        existingByLocator.ParentID,
			Name:            existingByLocator.Name,
		}
	}

	if err := q.UpdateProxmoxVM(ctx, database.UpdateProxmoxVMParams{
		InventoryItemID: existing.InventoryItemID,
		Node:            node,
		Vmid:            int32(vmid),
		GuestType:       string(gt),
		UpstreamUuid:    summary.UpstreamUUID,
		IsTemplate:      summary.IsTemplate,
		CpuCount:        &summary.CPUCount,
		MemoryMb:        &summary.MemoryMB,
		DiskGb:          &summary.DiskGB,
	}); err != nil {
		return fmt.Errorf("updating proxmox_vms: %w", err)
	}

	if existing.ParentID == nil || *existing.ParentID != parentID {
		if err := q.UpdateInventoryItemParent(ctx, database.UpdateInventoryItemParentParams{
			ParentID: &parentID,
			ID:       existing.InventoryItemID,
		}); err != nil {
			return fmt.Errorf("updating inventory item parent: %w", err)
		}
	}

	if existing.Name != summary.Name {
		if err := q.UpdateInventoryItemName(ctx, database.UpdateInventoryItemNameParams{
			Name: summary.Name,
			ID:   existing.InventoryItemID,
		}); err != nil {
			return fmt.Errorf("updating inventory item name: %w", err)
		}
	}

	return applyImportedVMNotes(ctx, q, existing.InventoryItemID, summary.Notes)
}

func removeStaleInventoryItemForReusedLocator(
	ctx context.Context,
	q *database.Queries,
	itemID uuid.UUID,
	node string,
	vmid int,
) error {
	blockers, err := q.ListInventoryDeletionBlockersInSubtree(ctx, itemID)
	if err != nil {
		return fmt.Errorf("checking stale inventory item dependencies for VMID %d on node %s: %w", vmid, node, err)
	}
	if len(blockers) > 0 {
		return fmt.Errorf(
			"cannot reuse VMID %d on node %s: inventory metadata is reserved by %s %q; restore the missing VM or remove its Kamino reference before retrying",
			vmid,
			node,
			blockers[0].BlockerType,
			blockers[0].BlockerName,
		)
	}
	if err := q.DeleteInventoryItem(ctx, itemID); err != nil {
		return fmt.Errorf("removing stale inventory item for reused locator: %w", err)
	}
	return nil
}

func (s *InventoryImporter) ensureVMConfigSummary(
	ctx context.Context,
	gt GuestType,
	node string,
	vmid int,
) (*VMConfigSummary, error) {
	return s.client.GetEnsuredVMConfigSummary(ctx, gt, node, vmid)
}

func (s *InventoryImporter) waitForVMConfigSummary(
	ctx context.Context,
	gt GuestType,
	node string,
	vmid int,
) (*VMConfigSummary, error) {
	for {
		summary, err := s.ensureVMConfigSummary(ctx, gt, node, vmid)
		if err == nil {
			return summary, nil
		}

		select {
		case <-ctx.Done():
			return nil, fmt.Errorf(
				"waiting for vm %d on node %s config to become available in Proxmox: %w",
				vmid,
				node,
				ctx.Err(),
			)
		case <-time.After(singleVMSyncPollInterval):
		}
	}
}

func decodePoolPath(poolID string) []string {
	return strings.Split(poolID, "/")
}

func applyImportedVMNotes(
	ctx context.Context,
	q *database.Queries,
	itemID uuid.UUID,
	notes string,
) error {
	if err := q.UpdateProxmoxVMNotesByItemID(ctx, database.UpdateProxmoxVMNotesByItemIDParams{
		Notes:           &notes,
		InventoryItemID: itemID,
	}); err != nil {
		return fmt.Errorf("updating imported proxmox_vms notes for item %s: %w", itemID, err)
	}
	return nil
}
