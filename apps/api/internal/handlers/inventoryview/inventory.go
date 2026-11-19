package inventoryview

import (
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/google/uuid"
)

type TreeNode struct {
	ID               uuid.UUID                `json:"id"`
	Name             string                   `json:"name"`
	Kind             string                   `json:"kind"`
	Description      *string                  `json:"description,omitempty"`
	DirectVMLimit    *int32                   `json:"direct_vm_limit"`
	EffectiveVMLimit *int32                   `json:"effective_vm_limit"`
	VMCount          *int32                   `json:"vm_count"`
	Permissions      httpx.PermissionEnvelope `json:"permissions"`
	Children         []TreeNode               `json:"children,omitempty"`
	VM               *VMDetail                `json:"vm,omitempty"`
}

type VMDetail struct {
	Node       string               `json:"node"`
	VMID       int32                `json:"vmid"`
	GuestType  string               `json:"guest_type"`
	IsTemplate bool                 `json:"is_template"`
	Notes      *string              `json:"notes,omitempty"`
	CPUCount   *int32               `json:"cpu_count,omitempty"`
	MemoryMB   *int32               `json:"memory_mb,omitempty"`
	DiskGB     *float64             `json:"disk_gb,omitempty"`
	Addresses  []InventoryVMAddress `json:"addresses,omitempty"`
}

type InventoryItem struct {
	ID                 uuid.UUID                `json:"id"`
	ParentID           *uuid.UUID               `json:"parent_id"`
	Kind               string                   `json:"kind"`
	Name               string                   `json:"name"`
	Description        *string                  `json:"description,omitempty"`
	InheritPermissions bool                     `json:"inherit_permissions"`
	DirectVMLimit      *int32                   `json:"direct_vm_limit"`
	EffectiveVMLimit   *int32                   `json:"effective_vm_limit"`
	VMCount            *int32                   `json:"vm_count"`
	Permissions        httpx.PermissionEnvelope `json:"permissions"`
	VM                 *VMDetail                `json:"vm,omitempty"`
}

type InventoryACLEntry struct {
	ID                  uuid.UUID `json:"id"`
	PrincipalID         uuid.UUID `json:"principal_id"`
	PrincipalType       string    `json:"principal_type"`
	PrincipalExternalID string    `json:"principal_external_id"`
	PrincipalName       *string   `json:"principal_name"`
	Effect              string    `json:"effect"`
	Permissions         int64     `json:"permissions"`
	Immutable           bool      `json:"immutable"`
}

type InheritedInventoryACLEntry struct {
	ID                  uuid.UUID `json:"id"`
	SourceItemID        uuid.UUID `json:"source_item_id"`
	SourceItemName      string    `json:"source_item_name"`
	PrincipalID         uuid.UUID `json:"principal_id"`
	PrincipalType       string    `json:"principal_type"`
	PrincipalExternalID string    `json:"principal_external_id"`
	PrincipalName       *string   `json:"principal_name"`
	Effect              string    `json:"effect"`
	Permissions         int64     `json:"permissions"`
	Immutable           bool      `json:"immutable"`
}

type InventoryACL struct {
	Entries          []InventoryACLEntry          `json:"entries"`
	InheritedEntries []InheritedInventoryACLEntry `json:"inherited_entries"`
}
