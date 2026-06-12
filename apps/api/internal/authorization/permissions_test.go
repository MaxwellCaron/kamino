package authorization

import "testing"

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
