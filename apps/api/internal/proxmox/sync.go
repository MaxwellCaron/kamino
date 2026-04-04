package proxmox

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

const rootFolderName = "Proxmox"

// Sync handles syncing Proxmox pools and VMs into the inventory database.
type Sync struct {
	db     *pgxpool.Pool
	client *Client
}

func NewSync(db *pgxpool.Pool, client *Client) *Sync {
	return &Sync{db: db, client: client}
}

// Run performs a full sync of pools (as folders) and VMs from Proxmox.
func (s *Sync) Run(ctx context.Context) error {
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
	poolFolders := make(map[string]pgtype.UUID, len(pools))
	for _, pool := range pools {
		folderID, err := ensureChildFolder(ctx, q, rootID, pool.PoolID)
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

// ensureRootFolder returns the root folder ID, creating it if it doesn't exist.
func ensureRootFolder(ctx context.Context, q *database.Queries) (pgtype.UUID, error) {
	id, err := q.GetRootFolderByName(ctx, rootFolderName)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return pgtype.UUID{}, err
	}
	return q.CreateRootFolder(ctx, rootFolderName)
}

// ensureChildFolder returns a child folder's ID, creating it if it doesn't exist.
func ensureChildFolder(ctx context.Context, q *database.Queries, parentID pgtype.UUID, name string) (pgtype.UUID, error) {
	id, err := q.GetChildFolderByName(ctx, database.GetChildFolderByNameParams{
		ParentID: parentID,
		Name:     name,
	})
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return pgtype.UUID{}, err
	}
	return q.CreateChildFolder(ctx, database.CreateChildFolderParams{
		ParentID: parentID,
		Name:     name,
	})
}

// syncVM creates or updates a VM's inventory item and proxmox_vms metadata.
func syncVM(ctx context.Context, q *database.Queries, parentID pgtype.UUID, vm VM) error {
	name := vm.Name
	if name == "" {
		name = fmt.Sprintf("vm-%d", vm.VMID)
	}

	cpuCount := int32(vm.MaxCPU)
	memoryMB := int32(vm.MaxMem / (1024 * 1024))

	var diskGB pgtype.Numeric
	if vm.MaxDisk > 0 {
		diskGB.Scan(fmt.Sprintf("%.2f", float64(vm.MaxDisk)/(1024*1024*1024)))
	}

	// Check if this VM already exists in the database
	existing, err := q.GetProxmoxVMByNodeVMID(ctx, database.GetProxmoxVMByNodeVMIDParams{
		Node: vm.Node,
		Vmid: int32(vm.VMID),
	})

	if errors.Is(err, pgx.ErrNoRows) {
		// New VM: create inventory item + proxmox_vms row
		itemID, err := q.CreateVMItem(ctx, database.CreateVMItemParams{
			ParentID: parentID,
			Name:     name,
		})
		if err != nil {
			return fmt.Errorf("creating inventory item: %w", err)
		}

		return q.InsertProxmoxVM(ctx, database.InsertProxmoxVMParams{
			InventoryItemID: itemID,
			Node:            vm.Node,
			Vmid:            int32(vm.VMID),
			CpuCount:        &cpuCount,
			MemoryMb:        &memoryMB,
			DiskGb:          diskGB,
		})
	}
	if err != nil {
		return fmt.Errorf("looking up VM: %w", err)
	}

	// Existing VM: update metadata
	if err := q.UpdateProxmoxVM(ctx, database.UpdateProxmoxVMParams{
		CpuCount: &cpuCount,
		MemoryMb: &memoryMB,
		DiskGb:   diskGB,
		Node:     vm.Node,
		Vmid:     int32(vm.VMID),
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

	// Move to correct parent if pool assignment changed
	if existing.ParentID != parentID {
		if err := q.UpdateInventoryItemParent(ctx, database.UpdateInventoryItemParentParams{
			ParentID: parentID,
			ID:       existing.InventoryItemID,
		}); err != nil {
			return fmt.Errorf("updating inventory item parent: %w", err)
		}
	}

	return nil
}
