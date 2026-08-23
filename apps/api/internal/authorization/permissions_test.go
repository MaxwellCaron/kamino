package authorization

import (
	"slices"
	"testing"
)

// TestMaskHas characterizes the Mask.Has bit-check helper.
func TestMaskHas(t *testing.T) {
	cases := []struct {
		name     string
		mask     Mask
		required Mask
		want     bool
	}{
		{"exact match", View, View, true},
		{"superset", View | PowerVM | ConsoleVM, PowerVM, true},
		{"two bits both present", View | PowerVM, View | PowerVM, true},
		{"two bits one missing", View, View | PowerVM, false},
		{"zero mask nonzero required", 0, View, false},
		{"zero required always true", View, 0, true},
		{"both zero", 0, 0, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.mask.Has(tc.required); got != tc.want {
				t.Errorf("Mask(%b).Has(%b): got %v, want %v", tc.mask, tc.required, got, tc.want)
			}
		})
	}
}

// TestEffectivePermissionsHas characterizes EffectivePermissions.Has behavior.
func TestEffectivePermissionsHas(t *testing.T) {
	cases := []struct {
		name     string
		allowed  Mask
		required Mask
		want     bool
	}{
		{"exact bit match", View, View, true},
		{"superset allowed", View | PowerVM | ConsoleVM, PowerVM, true},
		{"two bits required both present", View | PowerVM, View | PowerVM, true},
		{"two bits required one missing", View, View | PowerVM, false},
		{"zero allowed nonzero required", 0, View, false},
		{"zero required always true", View, 0, true},
		{"zero allowed zero required", 0, 0, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := EffectivePermissions{AllowedMask: tc.allowed}
			if got := p.Has(tc.required); got != tc.want {
				t.Errorf("Has(%b) with AllowedMask=%b: got %v, want %v", tc.required, tc.allowed, got, tc.want)
			}
		})
	}
}

// TestEffectivePermissionsCanRequest characterizes EffectivePermissions.CanRequest behavior.
func TestEffectivePermissionsCanRequest(t *testing.T) {
	cases := []struct {
		name     string
		request  Mask
		required Mask
		want     bool
	}{
		{"exact bit match", PowerVM, PowerVM, true},
		{"superset request", PowerVM | SnapshotVM, PowerVM, true},
		{"two bits required both present", PowerVM | SnapshotVM, PowerVM | SnapshotVM, true},
		{"two bits required one missing", PowerVM, PowerVM | SnapshotVM, false},
		{"zero request nonzero required", 0, PowerVM, false},
		{"zero required always true", PowerVM, 0, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := EffectivePermissions{RequestMask: tc.request}
			if got := p.CanRequest(tc.required); got != tc.want {
				t.Errorf("CanRequest(%b) with RequestMask=%b: got %v, want %v", tc.required, tc.request, got, tc.want)
			}
		})
	}
}

// TestEffectivePermissionsForTargetKind characterizes requestable mask computation.
func TestEffectivePermissionsForTargetKind(t *testing.T) {
	cases := []struct {
		name            string
		kind            InventoryPermissionTargetKind
		allowedMask     Mask
		deniedMask      Mask
		wantRequestMask Mask
	}{
		{
			name:            "vm with view only - gets PowerVM|SnapshotVM",
			kind:            InventoryPermissionTargetKindVM,
			allowedMask:     View,
			deniedMask:      0,
			wantRequestMask: PowerVM | SnapshotVM,
		},
		{
			name:            "vm without view - request mask is 0",
			kind:            InventoryPermissionTargetKindVM,
			allowedMask:     PowerVM,
			deniedMask:      0,
			wantRequestMask: 0,
		},
		{
			name:            "vm with view and PowerVM already allowed - only SnapshotVM requestable",
			kind:            InventoryPermissionTargetKindVM,
			allowedMask:     View | PowerVM,
			deniedMask:      0,
			wantRequestMask: SnapshotVM,
		},
		{
			name:            "vm with view and SnapshotVM denied - only PowerVM requestable",
			kind:            InventoryPermissionTargetKindVM,
			allowedMask:     View,
			deniedMask:      SnapshotVM,
			wantRequestMask: PowerVM,
		},
		{
			name:            "vm with view and both already allowed - request mask is 0",
			kind:            InventoryPermissionTargetKindVM,
			allowedMask:     View | PowerVM | SnapshotVM,
			deniedMask:      0,
			wantRequestMask: 0,
		},
		{
			name:            "folder kind - request mask always 0",
			kind:            InventoryPermissionTargetKindFolder,
			allowedMask:     View,
			deniedMask:      0,
			wantRequestMask: 0,
		},
		{
			name:            "folder kind with full access - request mask still 0",
			kind:            InventoryPermissionTargetKindFolder,
			allowedMask:     FullAccessMask,
			deniedMask:      0,
			wantRequestMask: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := EffectivePermissionsForTargetKind(tc.kind, tc.allowedMask, tc.deniedMask)
			if p.AllowedMask != tc.allowedMask {
				t.Errorf("AllowedMask: got %b, want %b", p.AllowedMask, tc.allowedMask)
			}
			if p.DeniedMask != tc.deniedMask {
				t.Errorf("DeniedMask: got %b, want %b", p.DeniedMask, tc.deniedMask)
			}
			if p.RequestMask != tc.wantRequestMask {
				t.Errorf("RequestMask: got %b, want %b", p.RequestMask, tc.wantRequestMask)
			}
		})
	}
}

// TestEffectiveManagementPermissionsHas characterizes the linear grant scan.
func TestEffectiveManagementPermissionsHas(t *testing.T) {
	cases := []struct {
		name     string
		grants   []ManagementPermission
		required ManagementPermission
		want     bool
	}{
		{"present grant", []ManagementPermission{ManagementPermissionManager}, ManagementPermissionManager, true},
		{"admin grant present", []ManagementPermission{ManagementPermissionAdministrator, ManagementPermissionManager}, ManagementPermissionAdministrator, true},
		{"absent grant", []ManagementPermission{ManagementPermissionManager}, ManagementPermissionAdministrator, false},
		{"empty grants", nil, ManagementPermissionManager, false},
		{"multiple grants present checked", []ManagementPermission{ManagementPermissionAdministrator, ManagementPermissionManager}, ManagementPermissionManager, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := EffectiveManagementPermissions{Grants: tc.grants}
			if got := p.Has(tc.required); got != tc.want {
				t.Errorf("Has(%q) with grants=%v: got %v, want %v", tc.required, tc.grants, got, tc.want)
			}
		})
	}
}

// TestKnownInventoryPermissionMask characterizes the full-access mask.
func TestKnownInventoryPermissionMask(t *testing.T) {
	mask := KnownInventoryPermissionMask()

	if mask == 0 {
		t.Error("KnownInventoryPermissionMask() returned 0, want nonzero")
	}

	if mask != FullAccessMask {
		t.Errorf("KnownInventoryPermissionMask() = %b, want FullAccessMask = %b", mask, FullAccessMask)
	}

	if (mask & View) != View {
		t.Errorf("KnownInventoryPermissionMask() does not include View bit; got %b", mask)
	}
}

func definitionByKey(t *testing.T, key InventoryPermission) InventoryPermissionDefinition {
	t.Helper()

	for _, definition := range inventoryPermissionDefinitions {
		if definition.Key == key {
			return definition
		}
	}

	t.Fatalf("no definition found for key %q", key)
	return InventoryPermissionDefinition{}
}

// TestInventoryPermissionDefinitionSections characterizes the grouping of
// Create VM into the VM section rather than the Folder section.
func TestInventoryPermissionDefinitionSections(t *testing.T) {
	createVM := definitionByKey(t, InventoryPermissionCreateVM)

	if createVM.SectionKey != "vm" || createVM.SectionLabel != "VM" {
		t.Errorf("Create VM section = (%q, %q), want (\"vm\", \"VM\")", createVM.SectionKey, createVM.SectionLabel)
	}
	if createVM.SectionOrder != 2 {
		t.Errorf("Create VM SectionOrder = %d, want 2", createVM.SectionOrder)
	}
	if createVM.Order != 0 {
		t.Errorf("Create VM Order = %d, want 0", createVM.Order)
	}

	wantKinds := []InventoryPermissionTargetKind{InventoryPermissionTargetKindFolder}
	if !slices.Equal(createVM.AppliesToKinds, wantKinds) {
		t.Errorf("Create VM AppliesToKinds = %v, want %v", createVM.AppliesToKinds, wantKinds)
	}

	createFolder := definitionByKey(t, InventoryPermissionCreateFolder)
	if createFolder.SectionKey != "folder" || createFolder.SectionLabel != "Folder" {
		t.Errorf("Create Folder section = (%q, %q), want (\"folder\", \"Folder\")", createFolder.SectionKey, createFolder.SectionLabel)
	}

	var vmOrders []int
	seenVMOrders := map[int]bool{}
	for _, definition := range inventoryPermissionDefinitions {
		if definition.SectionKey != "vm" {
			continue
		}
		if seenVMOrders[definition.Order] {
			t.Errorf("duplicate VM section Order %d (key %q)", definition.Order, definition.Key)
		}
		seenVMOrders[definition.Order] = true
		vmOrders = append(vmOrders, definition.Order)
	}

	if !slices.IsSorted(vmOrders) {
		t.Errorf("VM section Order values not ascending in source order: %v", vmOrders)
	}
	if len(vmOrders) == 0 || vmOrders[0] != 0 {
		t.Errorf("VM section Order values = %v, want to start at 0", vmOrders)
	}

	if mask := KnownInventoryPermissionMask(); mask != FullAccessMask {
		t.Errorf("KnownInventoryPermissionMask() = %b, want FullAccessMask = %b", mask, FullAccessMask)
	}
}
