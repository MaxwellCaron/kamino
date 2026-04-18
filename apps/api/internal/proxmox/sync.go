package proxmox

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
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

	row, err := q.GetProxmoxVMByNodeVMID(syncCtx, database.GetProxmoxVMByNodeVMIDParams{
		Node: node,
		Vmid: int32(vmid),
	})
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
		poolFolders[pool.PoolID] = folderID
	}

	// Sync VMs
	syncedCount := 0
	for _, vm := range vms {
		parentID := rootID
		if vm.Pool != "" {
			if id, ok := poolFolders[vm.Pool]; ok {
				parentID = id
			}
		}

		if err := syncVM(ctx, q, parentID, vm); err != nil {
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

	if rootID := findManagedRootFolderID(rows); rootID != nil {
		return *rootID, nil
	}

	return q.CreateRootFolder(ctx, proxmoxRootFolderName)
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

func syncVM(ctx context.Context, q *database.Queries, parentID uuid.UUID, vm VM) error {
	name := vm.Name
	if name == "" {
		name = fmt.Sprintf("vm-%d", vm.VMID)
	}

	cpuCount := int32(vm.MaxCPU)
	memoryMB := int32(vm.MaxMem / (1024 * 1024))
	diskGB := math.Round(float64(vm.MaxDisk)/(1024*1024*1024)*100) / 100

	// Check if this VM already exists in the database
	existing, err := q.GetProxmoxVMByNodeVMID(ctx, database.GetProxmoxVMByNodeVMIDParams{
		Node: vm.Node,
		Vmid: int32(vm.VMID),
	})

	if errors.Is(err, pgx.ErrNoRows) {
		// New VM: create inventory item + proxmox_vms row
		itemID, err := q.CreateVMItem(ctx, database.CreateVMItemParams{
			ParentID: &parentID,
			Name:     name,
		})
		if err != nil {
			return fmt.Errorf("creating inventory item: %w", err)
		}

		return q.InsertProxmoxVM(ctx, database.InsertProxmoxVMParams{
			InventoryItemID: itemID,
			Node:            vm.Node,
			Vmid:            int32(vm.VMID),
			IsTemplate:      vm.IsTemplate(),
			CpuCount:        &cpuCount,
			MemoryMb:        &memoryMB,
			DiskGb:          &diskGB,
		})
	}
	if err != nil {
		return fmt.Errorf("looking up VM: %w", err)
	}

	// Existing VM: update metadata
	if err := q.UpdateProxmoxVM(ctx, database.UpdateProxmoxVMParams{
		IsTemplate: vm.IsTemplate(),
		CpuCount:   &cpuCount,
		MemoryMb:   &memoryMB,
		DiskGb:     &diskGB,
		Node:       vm.Node,
		Vmid:       int32(vm.VMID),
	}); err != nil {
		return fmt.Errorf("updating proxmox_vms: %w", err)
	}

	// Update name if changed
	if existing.Name != name {
		if err := q.UpdateInventoryItemName(ctx, database.UpdateInventoryItemNameParams{
			Name: name,
			ID:   existing.InventoryItemID,
		}); err != nil {
			return fmt.Errorf("updating inventory item name: %w", err)
		}
	}

	return nil
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

	existing, err := q.GetProxmoxVMByNodeVMID(ctx, database.GetProxmoxVMByNodeVMIDParams{
		Node: node,
		Vmid: int32(vmid),
	})
	if errors.Is(err, pgx.ErrNoRows) {
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
			IsTemplate:      summary.IsTemplate,
			CpuCount:        &summary.CPUCount,
			MemoryMb:        &summary.MemoryMB,
			DiskGb:          &summary.DiskGB,
		})
	}
	if err != nil {
		return fmt.Errorf("looking up VM: %w", err)
	}

	if err := q.UpdateProxmoxVM(ctx, database.UpdateProxmoxVMParams{
		IsTemplate: summary.IsTemplate,
		CpuCount:   &summary.CPUCount,
		MemoryMb:   &summary.MemoryMB,
		DiskGb:     &summary.DiskGB,
		Node:       node,
		Vmid:       int32(vmid),
	}); err != nil {
		return fmt.Errorf("updating proxmox_vms: %w", err)
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

func (s *InventoryImporter) waitForVMConfigSummary(
	ctx context.Context,
	node string,
	vmid int,
) (*VMConfigSummary, error) {
	for {
		summary, err := s.client.GetVMConfigSummary(ctx, node, vmid)
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
	var (
		segments []string
		current  strings.Builder
	)

	for i := 0; i < len(poolID); i++ {
		if poolID[i] != '_' {
			current.WriteByte(poolID[i])
			continue
		}

		if i+1 < len(poolID) && poolID[i+1] == '_' {
			current.WriteByte('_')
			i++
			continue
		}

		segments = append(segments, current.String())
		current.Reset()
	}

	segments = append(segments, current.String())
	return segments
}
