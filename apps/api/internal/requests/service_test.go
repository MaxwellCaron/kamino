package requests

import (
	"testing"

	"github.com/MaxwellCaron/kamino/internal/authorization"
)

func TestNormalizeTablePageDefaults(t *testing.T) {
	page, rows, offset := normalizeTablePage(TablePageParams{})

	if page != 1 {
		t.Errorf("page = %d, want 1", page)
	}
	if rows != 25 {
		t.Errorf("rows = %d, want 25", rows)
	}
	if offset != 0 {
		t.Errorf("offset = %d, want 0", offset)
	}
}

func TestNormalizeTablePageComputesOffset(t *testing.T) {
	tests := []struct {
		name       string
		params     TablePageParams
		wantPage   int32
		wantRows   int32
		wantOffset int32
	}{
		{"page 1 rows 25", TablePageParams{Page: 1, Rows: 25}, 1, 25, 0},
		{"page 2 rows 25", TablePageParams{Page: 2, Rows: 25}, 2, 25, 25},
		{"page 3 rows 10", TablePageParams{Page: 3, Rows: 10}, 3, 10, 20},
		{"negative page defaults to 1", TablePageParams{Page: -1, Rows: 10}, 1, 10, 0},
		{"zero rows defaults to 25", TablePageParams{Page: 1, Rows: 0}, 1, 25, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			page, rows, offset := normalizeTablePage(tt.params)
			if page != tt.wantPage {
				t.Errorf("page = %d, want %d", page, tt.wantPage)
			}
			if rows != tt.wantRows {
				t.Errorf("rows = %d, want %d", rows, tt.wantRows)
			}
			if offset != tt.wantOffset {
				t.Errorf("offset = %d, want %d", offset, tt.wantOffset)
			}
		})
	}
}

func TestCanReviewRequestKind(t *testing.T) {
	managerPerms := authorization.EffectiveManagementPermissions{
		Grants: []authorization.ManagementPermission{
			authorization.ManagementPermissionManager,
		},
	}

	tests := []struct {
		name        string
		perms       authorization.EffectiveManagementPermissions
		requestKind string
		want        bool
	}{
		{
			name:        "manager can review personal pod requests",
			perms:       managerPerms,
			requestKind: RequestKindPersonalPodCreate,
			want:        true,
		},
		{
			name:        "manager can review inventory requests",
			perms:       managerPerms,
			requestKind: RequestKindInventoryVMPower,
			want:        true,
		},
		{
			name:        "non-manager cannot review personal pod requests",
			perms:       authorization.EffectiveManagementPermissions{},
			requestKind: RequestKindPersonalPodCreate,
			want:        false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := canReviewRequestKind(tt.perms, tt.requestKind); got != tt.want {
				t.Fatalf("canReviewRequestKind() = %v, want %v", got, tt.want)
			}
		})
	}
}
