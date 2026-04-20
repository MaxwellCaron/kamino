package authorization

import "slices"

type InventoryPermission string

const (
	InventoryPermissionView              InventoryPermission = "view"
	InventoryPermissionCreateVM          InventoryPermission = "createVm"
	InventoryPermissionCreateFolder      InventoryPermission = "createFolder"
	InventoryPermissionRenameVM          InventoryPermission = "renameVm"
	InventoryPermissionRenameFolder      InventoryPermission = "renameFolder"
	InventoryPermissionDeleteVM          InventoryPermission = "deleteVm"
	InventoryPermissionDeleteFolder      InventoryPermission = "deleteFolder"
	InventoryPermissionMoveVM            InventoryPermission = "moveVm"
	InventoryPermissionMoveFolder        InventoryPermission = "moveFolder"
	InventoryPermissionPowerVM           InventoryPermission = "powerVm"
	InventoryPermissionConsoleVM         InventoryPermission = "consoleVm"
	InventoryPermissionCloneVM           InventoryPermission = "cloneVm"
	InventoryPermissionSnapshotVM        InventoryPermission = "snapshotVm"
	InventoryPermissionTemplateVM        InventoryPermission = "templateVm"
	InventoryPermissionManagePermissions InventoryPermission = "managePermissions"
	InventoryPermissionEditVMHardware    InventoryPermission = "editVmHardware"
)

type InventoryPermissionTargetKind string

const (
	InventoryPermissionTargetKindFolder InventoryPermissionTargetKind = "folder"
	InventoryPermissionTargetKindVM     InventoryPermissionTargetKind = "vm"
)

type Mask int64

const (
	View Mask = 1 << iota
	CreateVM
	CreateFolder
	RenameVM
	RenameFolder
	DeleteVM
	DeleteFolder
	MoveVM
	MoveFolder
	PowerVM
	ConsoleVM
	CloneVM
	SnapshotVM
	TemplateVM
	ManagePermissions
	EditVMHardware
)

type InventoryPermissionDefinition struct {
	Key            InventoryPermission             `json:"key"`
	Label          string                          `json:"label"`
	Description    string                          `json:"description"`
	SectionKey     string                          `json:"section_key"`
	SectionLabel   string                          `json:"section_label"`
	SectionOrder   int                             `json:"section_order"`
	Order          int                             `json:"order"`
	Bit            Mask                            `json:"bit"`
	AppliesToKinds []InventoryPermissionTargetKind `json:"applies_to_kinds"`
}

var inventoryPermissionDefinitions = []InventoryPermissionDefinition{
	{
		Key:            InventoryPermissionView,
		Label:          "View",
		Description:    "Show inventory items covered by this rule in tree and details views.",
		SectionKey:     "general",
		SectionLabel:   "General",
		SectionOrder:   0,
		Order:          0,
		Bit:            View,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
	{
		Key:            InventoryPermissionManagePermissions,
		Label:          "Manage Permissions",
		Description:    "Edit direct ACL overrides for items covered by this rule.",
		SectionKey:     "general",
		SectionLabel:   "General",
		SectionOrder:   0,
		Order:          1,
		Bit:            ManagePermissions,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
	{
		Key:            InventoryPermissionCreateVM,
		Label:          "Create VM",
		Description:    "Create new VMs inside this folder.",
		SectionKey:     "folder",
		SectionLabel:   "Folder",
		SectionOrder:   1,
		Order:          0,
		Bit:            CreateVM,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder},
	},
	{
		Key:            InventoryPermissionCreateFolder,
		Label:          "Create Folder",
		Description:    "Create child folders inside this folder.",
		SectionKey:     "folder",
		SectionLabel:   "Folder",
		SectionOrder:   1,
		Order:          1,
		Bit:            CreateFolder,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder},
	},
	{
		Key:            InventoryPermissionRenameFolder,
		Label:          "Rename Folder",
		Description:    "Rename this folder.",
		SectionKey:     "folder",
		SectionLabel:   "Folder",
		SectionOrder:   1,
		Order:          2,
		Bit:            RenameFolder,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder},
	},
	{
		Key:            InventoryPermissionDeleteFolder,
		Label:          "Delete Folder",
		Description:    "Delete this folder and its subtree.",
		SectionKey:     "folder",
		SectionLabel:   "Folder",
		SectionOrder:   1,
		Order:          3,
		Bit:            DeleteFolder,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder},
	},
	{
		Key:            InventoryPermissionMoveFolder,
		Label:          "Move Folder",
		Description:    "Move this folder within the inventory tree.",
		SectionKey:     "folder",
		SectionLabel:   "Folder",
		SectionOrder:   1,
		Order:          4,
		Bit:            MoveFolder,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder},
	},
	{
		Key:            InventoryPermissionEditVMHardware,
		Label:          "Hardware",
		Description:    "Edit CPU, memory, disk, firmware, and network hardware for VMs covered by this rule.",
		SectionKey:     "vm",
		SectionLabel:   "VM",
		SectionOrder:   2,
		Order:          0,
		Bit:            EditVMHardware,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
	{
		Key:            InventoryPermissionRenameVM,
		Label:          "Rename VM",
		Description:    "Rename VMs or templates covered by this rule.",
		SectionKey:     "vm",
		SectionLabel:   "VM",
		SectionOrder:   2,
		Order:          1,
		Bit:            RenameVM,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
	{
		Key:            InventoryPermissionDeleteVM,
		Label:          "Delete VM",
		Description:    "Delete VMs or templates covered by this rule.",
		SectionKey:     "vm",
		SectionLabel:   "VM",
		SectionOrder:   2,
		Order:          2,
		Bit:            DeleteVM,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
	{
		Key:            InventoryPermissionMoveVM,
		Label:          "Move VM",
		Description:    "Move VMs covered by this rule between folders.",
		SectionKey:     "vm",
		SectionLabel:   "VM",
		SectionOrder:   2,
		Order:          3,
		Bit:            MoveVM,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
	{
		Key:            InventoryPermissionPowerVM,
		Label:          "Power VM",
		Description:    "Start, stop, reboot, and shut down VMs covered by this rule.",
		SectionKey:     "vm",
		SectionLabel:   "VM",
		SectionOrder:   2,
		Order:          4,
		Bit:            PowerVM,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
	{
		Key:            InventoryPermissionConsoleVM,
		Label:          "Console VM",
		Description:    "Open the VNC console for VMs covered by this rule.",
		SectionKey:     "vm",
		SectionLabel:   "VM",
		SectionOrder:   2,
		Order:          5,
		Bit:            ConsoleVM,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
	{
		Key:            InventoryPermissionCloneVM,
		Label:          "Clone VM",
		Description:    "Clone VMs or templates covered by this rule.",
		SectionKey:     "vm",
		SectionLabel:   "VM",
		SectionOrder:   2,
		Order:          6,
		Bit:            CloneVM,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
	{
		Key:            InventoryPermissionSnapshotVM,
		Label:          "Snapshot VM",
		Description:    "Create, delete, and roll back snapshots for VMs covered by this rule.",
		SectionKey:     "vm",
		SectionLabel:   "VM",
		SectionOrder:   2,
		Order:          7,
		Bit:            SnapshotVM,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
	{
		Key:            InventoryPermissionTemplateVM,
		Label:          "Templatize VM",
		Description:    "Convert VMs covered by this rule into templates.",
		SectionKey:     "vm",
		SectionLabel:   "VM",
		SectionOrder:   2,
		Order:          8,
		Bit:            TemplateVM,
		AppliesToKinds: []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder, InventoryPermissionTargetKindVM},
	},
}

var FullAccessMask = KnownInventoryPermissionMask()

func InventoryPermissionCatalog() []InventoryPermissionDefinition {
	return slices.Clone(inventoryPermissionDefinitions)
}

func KnownInventoryPermissionMask() Mask {
	var mask Mask
	for _, definition := range inventoryPermissionDefinitions {
		mask |= definition.Bit
	}

	return mask
}

type EffectivePermissions struct {
	AllowedMask Mask `json:"allowed_mask"`
	DeniedMask  Mask `json:"denied_mask"`
}

func (p EffectivePermissions) Has(required Mask) bool {
	return (p.AllowedMask & required) == required
}

type EffectiveManagementPermissions struct {
	Grants []ManagementPermission `json:"grants"`
}

func (p EffectiveManagementPermissions) Has(required ManagementPermission) bool {
	for _, grant := range p.Grants {
		if grant == required {
			return true
		}
	}

	return false
}

type ManagementPermission string

const (
	ManagementPermissionInfrastructureView   ManagementPermission = "infrastructure.view"
	ManagementPermissionInfrastructureManage ManagementPermission = "infrastructure.manage"
	ManagementPermissionPrincipalsView       ManagementPermission = "principals.view"
	ManagementPermissionPrincipalsManage     ManagementPermission = "principals.manage"
	ManagementPermissionAccessManage         ManagementPermission = "access.manage"
	ManagementPermissionAdministrator        ManagementPermission = "administrator"
)

type ManagementPermissionDefinition struct {
	Key           ManagementPermission   `json:"key"`
	Label         string                 `json:"label"`
	Description   string                 `json:"description"`
	SectionKey    string                 `json:"section_key"`
	SectionLabel  string                 `json:"section_label"`
	SectionOrder  int                    `json:"section_order"`
	Order         int                    `json:"order"`
	Dangerous     bool                   `json:"dangerous"`
	BootstrapOnly bool                   `json:"bootstrap_only"`
	Implies       []ManagementPermission `json:"-"`
}

var managementPermissionDefinitions = []ManagementPermissionDefinition{
	{
		Key:          ManagementPermissionInfrastructureView,
		Label:        "View Infrastructure",
		Description:  "View infrastructure such as SDN.",
		SectionKey:   "infrastructure",
		SectionLabel: "Infrastructure",
		SectionOrder: 0,
		Order:        0,
	},
	{
		Key:          ManagementPermissionInfrastructureManage,
		Label:        "Manage Infrastructure",
		Description:  "Create, edit, and delete infrastructure resources.",
		SectionKey:   "infrastructure",
		SectionLabel: "Infrastructure",
		SectionOrder: 0,
		Order:        1,
		Implies:      []ManagementPermission{ManagementPermissionInfrastructureView},
	},
	{
		Key:          ManagementPermissionPrincipalsView,
		Label:        "View Principals",
		Description:  "Read users, groups, and membership data from the principal provider.",
		SectionKey:   "principals",
		SectionLabel: "Principals",
		SectionOrder: 1,
		Order:        0,
	},
	{
		Key:          ManagementPermissionPrincipalsManage,
		Label:        "Manage Principals",
		Description:  "Create, edit, and delete users or groups and manage memberships.",
		SectionKey:   "principals",
		SectionLabel: "Principals",
		SectionOrder: 1,
		Order:        1,
		Implies:      []ManagementPermission{ManagementPermissionPrincipalsView},
	},
	{
		Key:          ManagementPermissionAccessManage,
		Label:        "Manage Permissions",
		Description:  "Edit a group's management permissions.",
		SectionKey:   "access",
		SectionLabel: "Access",
		SectionOrder: 2,
		Order:        0,
	},
	{
		Key:           ManagementPermissionAdministrator,
		Label:         "Administrator",
		Description:   "Grant every current and future management permission. This is a dangerous permission to grant.",
		SectionKey:    "advanced",
		SectionLabel:  "Advanced",
		SectionOrder:  3,
		Order:         0,
		Dangerous:     true,
		BootstrapOnly: true,
	},
}

var managementPermissionDefinitionsByKey = func() map[ManagementPermission]ManagementPermissionDefinition {
	byKey := make(map[ManagementPermission]ManagementPermissionDefinition, len(managementPermissionDefinitions))
	for _, definition := range managementPermissionDefinitions {
		byKey[definition.Key] = definition
	}

	return byKey
}()

func ManagementPermissionCatalog() []ManagementPermissionDefinition {
	return slices.Clone(managementPermissionDefinitions)
}

func AllManagementPermissions() []ManagementPermission {
	permissions := make([]ManagementPermission, 0, len(managementPermissionDefinitions))
	for _, definition := range managementPermissionDefinitions {
		permissions = append(permissions, definition.Key)
	}

	return permissions
}

func NormalizeDirectManagementPermissions(
	permissions []ManagementPermission,
) ([]ManagementPermission, error) {
	set := make(map[ManagementPermission]struct{}, len(permissions))
	for _, permission := range permissions {
		definition, ok := managementPermissionDefinitionsByKey[permission]
		if !ok {
			return nil, ErrUnknownManagementPermission
		}
		set[definition.Key] = struct{}{}
	}

	for changed := true; changed; {
		changed = false
		for permission := range set {
			definition := managementPermissionDefinitionsByKey[permission]
			for _, implied := range definition.Implies {
				if _, ok := set[implied]; ok {
					continue
				}
				set[implied] = struct{}{}
				changed = true
			}
		}
	}

	return sortManagementPermissions(set), nil
}

func ExpandEffectiveManagementPermissions(
	permissions []ManagementPermission,
) ([]ManagementPermission, error) {
	direct, err := NormalizeDirectManagementPermissions(permissions)
	if err != nil {
		return nil, err
	}

	set := make(map[ManagementPermission]struct{}, len(direct))
	for _, permission := range direct {
		set[permission] = struct{}{}
	}

	if _, ok := set[ManagementPermissionAdministrator]; ok {
		for _, permission := range AllManagementPermissions() {
			set[permission] = struct{}{}
		}
	}

	return sortManagementPermissions(set), nil
}

func sortManagementPermissions(
	set map[ManagementPermission]struct{},
) []ManagementPermission {
	permissions := make([]ManagementPermission, 0, len(set))
	for permission := range set {
		permissions = append(permissions, permission)
	}

	slices.SortFunc(permissions, func(a, b ManagementPermission) int {
		definitionA := managementPermissionDefinitionsByKey[a]
		definitionB := managementPermissionDefinitionsByKey[b]

		switch {
		case definitionA.SectionOrder != definitionB.SectionOrder:
			return definitionA.SectionOrder - definitionB.SectionOrder
		case definitionA.Order != definitionB.Order:
			return definitionA.Order - definitionB.Order
		case string(a) < string(b):
			return -1
		case string(a) > string(b):
			return 1
		default:
			return 0
		}
	})

	return permissions
}
