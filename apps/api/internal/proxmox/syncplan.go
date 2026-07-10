package proxmox

import (
	"context"
	"fmt"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

// SyncChangeKind classifies a sync diff entry.
type SyncChangeKind string

const (
	SyncChangeAdd    SyncChangeKind = "add"
	SyncChangeRemove SyncChangeKind = "remove"
	SyncChangeUpdate SyncChangeKind = "update"
)

// SyncFieldChange describes a single field that differs between Proxmox and the DB.
type SyncFieldChange struct {
	Field string `json:"field"` // "name" | "template"
	From  string `json:"from"`
	To    string `json:"to"`
}

// SyncChange is one item in the diff result.
type SyncChange struct {
	ID         string            `json:"id"` // stable key: "node/vmid"
	Kind       SyncChangeKind    `json:"kind"`
	Node       string            `json:"node"`
	VMID       int               `json:"vmid"`
	Name       string            `json:"name"`
	IsTemplate bool              `json:"is_template"`
	GuestType  string            `json:"guest_type"`
	Fields     []SyncFieldChange `json:"fields,omitempty"`
	Removable  bool              `json:"removable,omitempty"`
	Blockers   []string          `json:"blockers,omitempty"`

	// Internal fields — not serialised. Used by ApplySync.
	ItemID   uuid.UUID  `json:"-"`
	ParentID *uuid.UUID `json:"-"`
	Pool     string     `json:"-"` // Proxmox pool name, for add placement
}

// SyncDiff is the complete diff returned by Plan.
type SyncDiff struct {
	Adds           []SyncChange `json:"adds"`
	Removes        []SyncChange `json:"removes"`
	Updates        []SyncChange `json:"updates"`
	ProxmoxVMCount int          `json:"proxmox_vm_count"`
	Warning        string       `json:"warning,omitempty"`
}

// dbVMRecord holds the relevant DB columns for a single VM item.
type dbVMRecord struct {
	itemID     uuid.UUID
	parentID   *uuid.UUID
	name       string
	isTemplate bool
	guestType  string
}

// computeSyncDiff builds the diff from pre-fetched slices.
//
// blockersFn(inventoryItemID) returns human-readable blocker strings; it is
// called only for potential removes. Returning (nil, nil) means removable.
// This is a standalone function so unit tests can exercise it without a real
// Proxmox API or database connection.
func computeSyncDiff(
	vms []VM,
	dbRows []database.GetAllInventoryItemsRow,
	blockersFn func(id uuid.UUID) ([]string, error),
) (SyncDiff, error) {
	// Index Proxmox VMs by "node/vmid".
	proxmoxByKey := make(map[string]VM, len(vms))
	for _, vm := range vms {
		key := syncVMKey(vm.Node, vm.VMID)
		proxmoxByKey[key] = vm
	}

	// Index DB VM rows (skip folders and items without node/vmid) by "node/vmid".
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

	// Adds: in Proxmox but not in DB.
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
				Pool:       vm.Pool,
			})
		}
	}

	// Removes: in DB but not in Proxmox.
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
				Removable:  len(blockers) == 0,
				Blockers:   blockers,
				ItemID:     rec.itemID,
				ParentID:   rec.parentID,
			})
		}
	}

	// Updates: in both, with name or template flag differing.
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
		if len(fields) > 0 {
			diff.Updates = append(diff.Updates, SyncChange{
				ID:         key,
				Kind:       SyncChangeUpdate,
				Node:       vm.Node,
				VMID:       vm.VMID,
				Name:       vm.Name,
				IsTemplate: vm.IsTemplate(),
				GuestType:  vm.Type,
				Fields:     fields,
				ItemID:     rec.itemID,
				ParentID:   rec.parentID,
			})
		}
	}

	return diff, nil
}

// Plan fetches live Proxmox and DB state, then computes the drift diff.
// It performs no writes.
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

	// Ensure arrays are never null in JSON output.
	if diff.Adds == nil {
		diff.Adds = []SyncChange{}
	}
	if diff.Removes == nil {
		diff.Removes = []SyncChange{}
	}
	if diff.Updates == nil {
		diff.Updates = []SyncChange{}
	}
	return diff, nil
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
