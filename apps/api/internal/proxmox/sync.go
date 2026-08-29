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
	"golang.org/x/sync/errgroup"
)

// InventoryImporter syncs Proxmox pools and VMs into the inventory database.
type InventoryImporter struct {
	db     *pgxpool.Pool
	client *Client
}

const (
	singleVMSyncTimeout        = 15 * time.Second
	singleVMSyncPollInterval   = 1 * time.Second
	initialVMImportConcurrency = 4
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

// Run imports Proxmox pools as folders (adopting existing structure/comments), then imports VMs into them.
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

	poolFolders, err := adoptProxmoxPools(ctx, q, rootID, pools)
	if err != nil {
		return fmt.Errorf("adopting proxmox pools: %w", err)
	}

	// Sync VMs, bounded to a small number of concurrent imports.
	results := runBoundedVMImports(ctx, vms, initialVMImportConcurrency, func(ctx context.Context, vm VM) error {
		gt := GuestTypeFromVMType(vm.Type)

		parentID, err := importedVMParent(rootID, poolFolders, vm)
		if err != nil {
			return err
		}

		summary, err := s.ensureVMConfigSummary(ctx, gt, vm.Node, vm.VMID)
		if err != nil {
			return fmt.Errorf("loading config summary for VM %d on node %s: %w", vm.VMID, vm.Node, err)
		}

		return s.syncVMConfigSummaryInTx(ctx, parentID, vm.Node, vm.VMID, gt, summary)
	})

	syncedCount := 0
	var syncErrs []error
	for _, result := range results {
		if !result.Attempted {
			continue
		}
		if result.Err != nil {
			log.Printf("Warning: %v", result.Err)
			syncErrs = append(syncErrs, result.Err)
			continue
		}
		syncedCount++
	}

	log.Printf("Proxmox sync complete: %d pools, %d/%d VMs", len(pools), syncedCount, len(vms))
	return errors.Join(syncErrs...)
}

// vmImportResult holds one VM import outcome at its original slice index.
type vmImportResult struct {
	Attempted bool
	Err       error
}

// runBoundedVMImports runs syncOne for each supported VM with at most limit callbacks active concurrently.
func runBoundedVMImports(
	ctx context.Context,
	vms []VM,
	limit int,
	syncOne func(ctx context.Context, vm VM) error,
) []vmImportResult {
	results := make([]vmImportResult, len(vms))
	if len(vms) == 0 {
		return results
	}

	group := new(errgroup.Group)
	if limit > 0 {
		group.SetLimit(limit)
	}

	for index, vm := range vms {
		if vm.Type != "qemu" && vm.Type != "lxc" {
			continue
		}

		index, vm := index, vm
		results[index].Attempted = true
		group.Go(func() error {
			results[index].Err = syncOne(ctx, vm)
			return nil
		})
	}

	_ = group.Wait()
	return results
}

func importedVMParent(rootID uuid.UUID, poolFolders map[string]uuid.UUID, vm VM) (uuid.UUID, error) {
	if vm.Pool == "" {
		return rootID, nil
	}

	folderID, ok := poolFolders[vm.Pool]
	if !ok {
		return uuid.Nil, fmt.Errorf(
			"VM %d on node %s references pool %q missing from the Proxmox pool snapshot",
			vm.VMID,
			vm.Node,
			vm.Pool,
		)
	}

	return folderID, nil
}

// adoptProxmoxPools ensures a matching folder exists for every live Proxmox pool, importing its comment as the description.
func adoptProxmoxPools(ctx context.Context, q *database.Queries, rootID uuid.UUID, pools []Pool) (map[string]uuid.UUID, error) {
	poolFolders := make(map[string]uuid.UUID, len(pools))
	for _, pool := range pools {
		folderID, err := ensureFolderPath(ctx, q, rootID, decodePoolPath(pool.PoolID))
		if err != nil {
			return nil, fmt.Errorf("ensuring folder for pool %q: %w", pool.PoolID, err)
		}
		if err := applyImportedPoolDescription(ctx, q, pool.PoolID, pool.Comment, folderID); err != nil {
			return nil, fmt.Errorf("importing pool %q comment: %w", pool.PoolID, err)
		}
		poolFolders[pool.PoolID] = folderID
	}
	return poolFolders, nil
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

const maxImportedPoolCommentLength = 256

func normalizeImportedPoolDescription(comment string) *string {
	value := strings.TrimSpace(comment)
	if value == "" {
		return nil
	}
	return &value
}

func applyImportedPoolDescription(ctx context.Context, q *database.Queries, poolID, comment string, folderID uuid.UUID) error {
	description := normalizeImportedPoolDescription(comment)
	if description != nil && len(*description) > maxImportedPoolCommentLength {
		log.Printf(
			"Warning: skipping pool %q comment import (%d characters exceeds %d limit)",
			poolID,
			len(*description),
			maxImportedPoolCommentLength,
		)
		return nil
	}

	return q.UpdateInventoryFolderDescription(ctx, database.UpdateInventoryFolderDescriptionParams{
		Description: description,
		ID:          folderID,
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
