package proxmoxsync

import (
	"context"
	"fmt"
	"sort"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/inventory/poolmapping"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
)

type SyncChangeKind string

const (
	SyncChangeAdd    SyncChangeKind = "add"
	SyncChangeRemove SyncChangeKind = "remove"
	SyncChangeUpdate SyncChangeKind = "update"
)

type SyncFieldChange struct {
	Field string `json:"field"` // "name" | "template" | "pool"
	From  string `json:"from"`
	To    string `json:"to"`
}

type SyncChange struct {
	ID         string            `json:"id"` // stable key: "node/vmid"
	Kind       SyncChangeKind    `json:"kind"`
	Node       string            `json:"node"`
	VMID       int               `json:"vmid"`
	Name       string            `json:"name"`
	IsTemplate bool              `json:"is_template"`
	GuestType  string            `json:"guest_type"`
	Actionable bool              `json:"actionable"`
	Fields     []SyncFieldChange `json:"fields,omitempty"`
	Blockers   []string          `json:"blockers,omitempty"`

	// Internal fields — not serialised. Used by ApplySync.
	ItemID   uuid.UUID  `json:"-"`
	ParentID *uuid.UUID `json:"-"`
	Pool     string     `json:"-"` // Proxmox pool name, for add placement
}

type SyncDiff struct {
	Adds           []SyncChange `json:"adds"`
	Removes        []SyncChange `json:"removes"`
	Updates        []SyncChange `json:"updates"`
	ProxmoxVMCount int          `json:"proxmox_vm_count"`
	Warning        string       `json:"warning,omitempty"`
}

type dbVMRecord struct {
	itemID     uuid.UUID
	parentID   *uuid.UUID
	name       string
	isTemplate bool
	guestType  string
	pool       string
}

// computeSyncDiff builds the diff from pre-fetched slices.
//
// blockersFn(inventoryItemID) returns human-readable blocker strings; it is
// called only for potential removes. Returning (nil, nil) means actionable.
// This is a standalone function so unit tests can exercise it without a real
// Proxmox API or database connection.
func computeSyncDiff(
	vms []proxmox.VM,
	dbRows []database.GetAllInventoryItemsRow,
	blockersFn func(id uuid.UUID) ([]string, error),
) (SyncDiff, error) {
	itemIDs := make([]uuid.UUID, 0, len(dbRows))
	for _, row := range dbRows {
		if row.Kind != database.InventoryItemKindFolder {
			itemIDs = append(itemIDs, row.ID)
		}
	}
	placements, err := poolmapping.DesiredVMPoolPlacements(dbRows, itemIDs)
	if err != nil {
		return SyncDiff{}, fmt.Errorf("resolving inventory pool placement: %w", err)
	}

	dbPools := make(map[string]string, len(placements))
	for _, placement := range placements {
		dbPools[syncVMKey(placement.Node, placement.VMID)] = placement.DesiredPool
	}

	proxmoxByKey := make(map[string]proxmox.VM, len(vms))
	for _, vm := range vms {
		key := syncVMKey(vm.Node, vm.VMID)
		proxmoxByKey[key] = vm
	}

	dbByKey := make(map[string]dbVMRecord, len(dbRows))
	for _, row := range dbRows {
		if row.Kind == database.InventoryItemKindFolder || row.Node == nil || row.Vmid == nil {
			continue
		}
		key := syncVMKey(*row.Node, int(*row.Vmid))
		isTemplate := row.IsTemplate != nil && *row.IsTemplate
		guestType := "qemu"
		if row.GuestType != nil {
			guestType = *row.GuestType
		}
		dbByKey[key] = dbVMRecord{
			itemID:     row.ID,
			parentID:   row.ParentID,
			name:       row.Name,
			isTemplate: isTemplate,
			guestType:  guestType,
			pool:       dbPools[key],
		}
	}

	// Safety guard: empty Proxmox response while DB has VMs → do not emit removes.
	if len(vms) == 0 && len(dbByKey) > 0 {
		return SyncDiff{
			ProxmoxVMCount: 0,
			Warning: "Proxmox returned zero VMs. This may indicate a connectivity problem. " +
				"Removals are suppressed until Proxmox reports live inventory.",
		}, nil
	}

	diff := SyncDiff{
		ProxmoxVMCount: len(vms),
	}

	for key, vm := range proxmoxByKey {
		if _, exists := dbByKey[key]; !exists {
			diff.Adds = append(diff.Adds, SyncChange{
				ID:         key,
				Kind:       SyncChangeAdd,
				Node:       vm.Node,
				VMID:       vm.VMID,
				Name:       vm.Name,
				IsTemplate: vm.IsTemplate(),
				GuestType:  vm.Type,
				Actionable: true,
				Pool:       vm.Pool,
			})
		}
	}

	for key, rec := range dbByKey {
		if _, exists := proxmoxByKey[key]; !exists {
			node, vmid := splitVMKey(key)
			blockers, err := blockersFn(rec.itemID)
			if err != nil {
				return SyncDiff{}, fmt.Errorf("checking blockers for %s: %w", key, err)
			}
			diff.Removes = append(diff.Removes, SyncChange{
				ID:         key,
				Kind:       SyncChangeRemove,
				Node:       node,
				VMID:       vmid,
				Name:       rec.name,
				IsTemplate: rec.isTemplate,
				GuestType:  rec.guestType,
				Actionable: len(blockers) == 0,
				Blockers:   blockers,
				ItemID:     rec.itemID,
				ParentID:   rec.parentID,
			})
		}
	}

	for key, vm := range proxmoxByKey {
		rec, exists := dbByKey[key]
		if !exists {
			continue
		}

		var fields []SyncFieldChange
		if vm.Name != rec.name {
			fields = append(fields, SyncFieldChange{
				Field: "name",
				From:  rec.name,
				To:    vm.Name,
			})
		}
		if vm.IsTemplate() != rec.isTemplate {
			from := boolStr(rec.isTemplate)
			to := boolStr(vm.IsTemplate())
			fields = append(fields, SyncFieldChange{
				Field: "template",
				From:  from,
				To:    to,
			})
		}
		if vm.Pool != rec.pool {
			fields = append(fields, SyncFieldChange{
				Field: "pool",
				From:  rec.pool,
				To:    vm.Pool,
			})
		}
		if len(fields) > 0 {
			diff.Updates = append(diff.Updates, SyncChange{
				ID:         key,
				Kind:       SyncChangeUpdate,
				Node:       vm.Node,
				VMID:       vm.VMID,
				Name:       vm.Name,
				IsTemplate: vm.IsTemplate(),
				GuestType:  vm.Type,
				Actionable: true,
				Fields:     fields,
				ItemID:     rec.itemID,
				ParentID:   rec.parentID,
				Pool:       vm.Pool,
			})
		}
	}

	return diff, nil
}

// sortSyncChanges orders a diff bucket deterministically by its stable "node/vmid" ID.
func sortSyncChanges(changes []SyncChange) {
	sort.SliceStable(changes, func(i, j int) bool {
		return changes[i].ID < changes[j].ID
	})
}

// Plan fetches live Proxmox and DB state, then computes the drift diff. It performs no writes.
func (s *InventoryImporter) Plan(ctx context.Context) (SyncDiff, error) {
	vms, err := s.client.GetVMs(ctx)
	if err != nil {
		return SyncDiff{}, fmt.Errorf("fetching Proxmox VMs: %w", err)
	}

	q := database.New(s.db)
	rows, err := q.GetAllInventoryItems(ctx)
	if err != nil {
		return SyncDiff{}, fmt.Errorf("loading inventory items: %w", err)
	}

	diff, err := computeSyncDiff(vms, rows, func(id uuid.UUID) ([]string, error) {
		blockers, err := q.ListInventoryDeletionBlockersInSubtree(ctx, id)
		if err != nil {
			return nil, err
		}
		result := make([]string, 0, len(blockers))
		for _, b := range blockers {
			result = append(result, b.BlockerType+": "+b.BlockerName)
		}
		return result, nil
	})
	if err != nil {
		return SyncDiff{}, err
	}

	sortSyncChanges(diff.Adds)
	sortSyncChanges(diff.Removes)
	sortSyncChanges(diff.Updates)

	diff.Adds = nonNilSyncChanges(diff.Adds)
	diff.Removes = nonNilSyncChanges(diff.Removes)
	diff.Updates = nonNilSyncChanges(diff.Updates)
	return diff, nil
}

// nonNilSyncChanges ensures a diff bucket serializes as `[]`, not `null`, when empty.
func nonNilSyncChanges(changes []SyncChange) []SyncChange {
	if changes == nil {
		return []SyncChange{}
	}
	return changes
}

func syncVMKey(node string, vmid int) string {
	return fmt.Sprintf("%s/%d", node, vmid)
}

func splitVMKey(key string) (string, int) {
	for i := len(key) - 1; i >= 0; i-- {
		if key[i] == '/' {
			var vmid int
			fmt.Sscanf(key[i+1:], "%d", &vmid) //nolint:errcheck
			return key[:i], vmid
		}
	}
	return key, 0
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
