package proxmox

import (
	"context"
	"errors"
	"fmt"
	"log"
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
) (uuid.UUID, error) {
	syncCtx, cancel := context.WithTimeout(ctx, singleVMSyncTimeout)
	defer cancel()

	summary, err := s.waitForVMConfigSummary(syncCtx, node, vmid)
	if err != nil {
		return uuid.Nil, err
	}

	q := database.New(s.db)
	if err := syncVMConfigSummary(syncCtx, q, parentID, node, vmid, summary); err != nil {
		return uuid.Nil, fmt.Errorf("syncing vm %d on node %s: %w", vmid, node, err)
	}

	row, err := q.GetProxmoxVMByUpstreamUUID(syncCtx, summary.UpstreamUUID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("loading synced vm %d on node %s: %w", vmid, node, err)
	}

	return row.InventoryItemID, nil
}

// Run performs a full sync of pools (as folders) and VMs from Proxmox.
func (s *InventoryImporter) Run(ctx context.Context) error {
	log.Println("Starting Proxmox inventory sync")

	pools, err := s.client.GetPools(ctx)
	if err != nil {
		return fmt.Errorf("fetching pools: %w", err)
	}

	vms, err := s.client.GetVMs(ctx)
	if err != nil {
		return fmt.Errorf("fetching VMs: %w", err)
	}

	q := database.New(s.db)

	// Ensure the root folder exists
	rootID, err := ensureRootFolder(ctx, q)
	if err != nil {
		return fmt.Errorf("ensuring root folder: %w", err)
	}

	// Sync pools as child folders under root
	poolFolders := make(map[string]uuid.UUID, len(pools))
	for _, pool := range pools {
		folderID, err := ensureFolderPath(ctx, q, rootID, decodePoolPath(pool.PoolID))
		if err != nil {
			return fmt.Errorf("ensuring folder for pool %q: %w", pool.PoolID, err)
		}
		if err := applyImportedPoolDescription(ctx, q, pool.PoolID, pool.Comment, folderID); err != nil {
			return fmt.Errorf("importing pool %q comment: %w", pool.PoolID, err)
		}
		poolFolders[pool.PoolID] = folderID
	}

	// Sync VMs
	syncedCount := 0
	for _, vm := range vms {
		if vm.Type != "qemu" {
			continue
		}

		parentID := rootID
		if vm.Pool != "" {
			if id, ok := poolFolders[vm.Pool]; ok {
				parentID = id
			}
		}

		summary, err := s.ensureVMConfigSummary(ctx, vm.Node, vm.VMID)
		if err != nil {
			log.Printf("Warning: failed to load config summary for VM %d on node %s: %v", vm.VMID, vm.Node, err)
			continue
		}

		if err := syncVMConfigSummary(ctx, q, parentID, vm.Node, vm.VMID, summary); err != nil {
			log.Printf("Warning: failed to sync VM %d on node %s: %v", vm.VMID, vm.Node, err)
			continue
		}
		syncedCount++
	}

	log.Printf("Proxmox sync complete: %d pools, %d/%d VMs", len(pools), syncedCount, len(vms))
	return nil
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

func syncVMConfigSummary(
	ctx context.Context,
	q *database.Queries,
	parentID uuid.UUID,
	node string,
	vmid int,
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
		if err := q.DeleteInventoryItem(ctx, existingByLocator.InventoryItemID); err != nil {
			return fmt.Errorf("removing stale inventory item for reused locator: %w", err)
		}
		existingByLocator = database.GetProxmoxVMByNodeVMIDRow{}
	}

	if existingByUUID.InventoryItemID == uuid.Nil && existingByLocator.InventoryItemID != uuid.Nil &&
		existingByLocator.UpstreamUuid != summary.UpstreamUUID {
		if err := q.DeleteInventoryItem(ctx, existingByLocator.InventoryItemID); err != nil {
			return fmt.Errorf("removing stale inventory item for reused locator: %w", err)
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

		return q.InsertProxmoxVM(ctx, database.InsertProxmoxVMParams{
			InventoryItemID: itemID,
			Node:            node,
			Vmid:            int32(vmid),
			UpstreamUuid:    summary.UpstreamUUID,
			IsTemplate:      summary.IsTemplate,
			CpuCount:        &summary.CPUCount,
			MemoryMb:        &summary.MemoryMB,
			DiskGb:          &summary.DiskGB,
		})
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

	return nil
}

func (s *InventoryImporter) ensureVMConfigSummary(
	ctx context.Context,
	node string,
	vmid int,
) (*VMConfigSummary, error) {
	if _, err := s.client.EnsureVMUpstreamUUID(ctx, node, vmid); err != nil {
		return nil, err
	}

	return s.client.GetVMConfigSummary(ctx, node, vmid)
}

func (s *InventoryImporter) waitForVMConfigSummary(
	ctx context.Context,
	node string,
	vmid int,
) (*VMConfigSummary, error) {
	for {
		summary, err := s.ensureVMConfigSummary(ctx, node, vmid)
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

func ensureFolderPath(ctx context.Context, q *database.Queries, rootID uuid.UUID, path []string) (uuid.UUID, error) {
	currentID := rootID
	if len(path) == 0 {
		return currentID, nil
	}

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

func decodePoolPath(poolID string) []string {
	return strings.Split(poolID, "/")
}

const maxImportedPoolCommentLength = 256

func applyImportedPoolDescription(
	ctx context.Context,
	q *database.Queries,
	poolID string,
	comment string,
	folderID uuid.UUID,
) error {
	value := strings.TrimSpace(comment)
	if value == "" {
		return nil
	}
	if len(value) > maxImportedPoolCommentLength {
		log.Printf(
			"Warning: skipping pool %q comment import (%d characters exceeds %d limit)",
			poolID,
			len(value),
			maxImportedPoolCommentLength,
		)
		return nil
	}

	return q.UpdateInventoryFolderDescription(ctx, database.UpdateInventoryFolderDescriptionParams{
		Description: &value,
		ID:          folderID,
	})
}
