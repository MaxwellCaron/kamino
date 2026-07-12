package handlers

import (
	"fmt"
	"math"
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/google/uuid"
)

func TestResolveCreateNetworkProfile(t *testing.T) {
	catalog, err := podnetwork.NewCatalog(podnetwork.Config{
		VNetPrefix:    "pod",
		DMZVNetPrefix: "dmz",
		DMZVLANBase:   1000,
		WANIPBase:     "172.16.",
	})
	if err != nil {
		t.Fatalf("NewCatalog() error = %v", err)
	}
	handler := PodsHandler{NetworkCatalog: catalog}

	tests := []struct {
		name        string
		profileKey  string
		wantKey     string
		wantManaged bool
		wantErr     bool
	}{
		{name: "none", wantKey: "", wantManaged: false},
		{name: "LAN router", profileKey: podnetwork.ProfileLANRouterV1, wantKey: podnetwork.ProfileLANRouterV1, wantManaged: true},
		{name: "LAN and DMZ router", profileKey: podnetwork.ProfileLANDMZRouterV1, wantKey: podnetwork.ProfileLANDMZRouterV1, wantManaged: true},
		{name: "unknown", profileKey: "unknown-profile", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotKey, gotManaged, err := handler.resolveCreateNetworkProfile(createPodRequest{
				NetworkProfileKey: tt.profileKey,
			})
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("resolveCreateNetworkProfile() error = %v", err)
			}
			if gotKey != tt.wantKey || gotManaged != tt.wantManaged {
				t.Fatalf("resolveCreateNetworkProfile() = (%q, %v), want (%q, %v)", gotKey, gotManaged, tt.wantKey, tt.wantManaged)
			}
		})
	}
}

func TestSlugify(t *testing.T) {
	tests := []struct {
		name string
		want string
	}{
		{"My Cool Pod", "my-cool-pod"},
		{"  spaces  ", "spaces"},
		{"UPPERCASE", "uppercase"},
		{"special!@#chars", "special-chars"},
		{"multiple---dashes", "multiple-dashes"},
		{"--leading-trailing--", "leading-trailing"},
		{"123-numbers", "123-numbers"},
		{"", "untitled-pod"},
		{"!@#$%", "untitled-pod"},
		{"hello_world", "hello-world"},
		{"Pod: Lab/Dev (v2)", "pod-lab-dev-v2"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := slugify(tt.name)
			if got != tt.want {
				t.Errorf("slugify(%q) = %q, want %q", tt.name, got, tt.want)
			}
		})
	}
}

func TestValidatePublishedPodPermissions(t *testing.T) {
	tests := []struct {
		name    string
		perms   publishPodPermissionRequest
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid non-overlapping masks",
			perms:   publishPodPermissionRequest{AllowMask: 3, DenyMask: 12},
			wantErr: false,
		},
		{
			name:    "valid allow only",
			perms:   publishPodPermissionRequest{AllowMask: 7, DenyMask: 0},
			wantErr: false,
		},
		{
			name:    "valid deny only",
			perms:   publishPodPermissionRequest{AllowMask: 0, DenyMask: 4},
			wantErr: false,
		},
		{
			name:    "valid both zero",
			perms:   publishPodPermissionRequest{AllowMask: 0, DenyMask: 0},
			wantErr: false,
		},
		{
			name:    "negative allow mask",
			perms:   publishPodPermissionRequest{AllowMask: -1, DenyMask: 0},
			wantErr: true,
			errMsg:  "non-negative",
		},
		{
			name:    "negative deny mask",
			perms:   publishPodPermissionRequest{AllowMask: 0, DenyMask: -1},
			wantErr: true,
			errMsg:  "non-negative",
		},
		{
			name:    "overlapping masks",
			perms:   publishPodPermissionRequest{AllowMask: 5, DenyMask: 7},
			wantErr: true,
			errMsg:  "overlap",
		},
		{
			name:    "mask exceeds full access",
			perms:   publishPodPermissionRequest{AllowMask: int64(authorization.FullAccessMask) << 1, DenyMask: 0},
			wantErr: true,
			errMsg:  "unsupported bits",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePublishedPodPermissions(tt.perms)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tt.errMsg != "" && !contains(err.Error(), tt.errMsg) {
					t.Errorf("error %q does not contain %q", err.Error(), tt.errMsg)
				}
			} else if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestParsePublishedPodStatus(t *testing.T) {
	tests := []struct {
		input   string
		want    database.PublishedPodStatus
		wantErr bool
	}{
		{"listed", database.PublishedPodStatusListed, false},
		{"unlisted", database.PublishedPodStatusUnlisted, false},
		{" listed ", database.PublishedPodStatusListed, false},
		{" unlisted ", database.PublishedPodStatusUnlisted, false},
		{"draft", "", true},
		{"", "", true},
		{"LISTED", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := parsePublishedPodStatus(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error for input %q, got %v", tt.input, got)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if got != tt.want {
					t.Errorf("got %q, want %q", got, tt.want)
				}
			}
		})
	}
}

func TestTrimOptionalString(t *testing.T) {
	t.Run("nil returns nil", func(t *testing.T) {
		if got := trimOptionalString(nil); got != nil {
			t.Errorf("got %v, want nil", got)
		}
	})
	t.Run("empty string returns nil", func(t *testing.T) {
		empty := ""
		if got := trimOptionalString(&empty); got != nil {
			t.Errorf("got %v, want nil", got)
		}
	})
	t.Run("whitespace-only returns nil", func(t *testing.T) {
		ws := "   "
		if got := trimOptionalString(&ws); got != nil {
			t.Errorf("got %v, want nil", got)
		}
	})
	t.Run("value is trimmed", func(t *testing.T) {
		val := "  hello  "
		got := trimOptionalString(&val)
		if got == nil || *got != "hello" {
			t.Errorf("got %v, want 'hello'", got)
		}
	})
	t.Run("already trimmed passes through", func(t *testing.T) {
		val := "world"
		got := trimOptionalString(&val)
		if got == nil || *got != "world" {
			t.Errorf("got %v, want 'world'", got)
		}
	})
}

func TestPositiveHardwareInt(t *testing.T) {
	t.Run("nil returns 1", func(t *testing.T) {
		if got := positiveHardwareInt(nil); got != 1 {
			t.Errorf("got %d, want 1", got)
		}
	})
	t.Run("zero returns 1", func(t *testing.T) {
		v := int32(0)
		if got := positiveHardwareInt(&v); got != 1 {
			t.Errorf("got %d, want 1", got)
		}
	})
	t.Run("negative returns 1", func(t *testing.T) {
		v := int32(-5)
		if got := positiveHardwareInt(&v); got != 1 {
			t.Errorf("got %d, want 1", got)
		}
	})
	t.Run("positive passes through", func(t *testing.T) {
		v := int32(4)
		if got := positiveHardwareInt(&v); got != 4 {
			t.Errorf("got %d, want 4", got)
		}
	})
}

func TestMemoryMBToGB(t *testing.T) {
	tests := []struct {
		name  string
		value *int32
		want  int32
	}{
		{"nil returns 1", nil, 1},
		{"zero returns 1", new(int32(0)), 1},
		{"negative returns 1", new(int32(-100)), 1},
		{"1024 MB = 1 GB", new(int32(1024)), 1},
		{"2048 MB = 2 GB", new(int32(2048)), 2},
		{"1536 MB rounds up to 2 GB", new(int32(1536)), 2},
		{"512 MB rounds up to 1 GB", new(int32(512)), 1},
		{"4096 MB = 4 GB", new(int32(4096)), 4},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := memoryMBToGB(tt.value); got != tt.want {
				t.Errorf("memoryMBToGB(%v) = %d, want %d", tt.value, got, tt.want)
			}
		})
	}
}

func TestDiskGBToInt(t *testing.T) {
	tests := []struct {
		name  string
		value *float64
		want  int32
	}{
		{"nil returns 1", nil, 1},
		{"zero returns 1", new(float64(0)), 1},
		{"negative returns 1", new(float64(-10)), 1},
		{"1.0 = 1", new(1.0), 1},
		{"1.5 rounds up to 2", new(1.5), 2},
		{"1.1 rounds up to 2", new(1.1), 2},
		{"50.0 = 50", new(50.0), 50},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := diskGBToInt(tt.value); got != tt.want {
				t.Errorf("diskGBToInt(%v) = %d, want %d", tt.value, got, tt.want)
			}
		})
	}
}

func TestMaskHas(t *testing.T) {
	tests := []struct {
		name     string
		mask     int64
		required authorization.Mask
		want     bool
	}{
		{"has bit set", 0b1010, authorization.Mask(0b0010), true},
		{"missing bit", 0b1010, authorization.Mask(0b0100), false},
		{"zero mask always false", 0, authorization.Mask(1), false},
		{"zero required always true", 5, authorization.Mask(0), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := maskHas(tt.mask, tt.required); got != tt.want {
				t.Errorf("maskHas(%b, %b) = %v, want %v", tt.mask, tt.required, got, tt.want)
			}
		})
	}
}

func TestParseOrNewUUID(t *testing.T) {
	t.Run("empty returns new UUID", func(t *testing.T) {
		got, err := parseOrNewUUID("")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got == uuid.Nil {
			t.Error("expected non-nil UUID")
		}
	})
	t.Run("whitespace returns new UUID", func(t *testing.T) {
		got, err := parseOrNewUUID("   ")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got == uuid.Nil {
			t.Error("expected non-nil UUID")
		}
	})
	t.Run("valid UUID is parsed", func(t *testing.T) {
		input := "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
		got, err := parseOrNewUUID(input)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.String() != input {
			t.Errorf("got %v, want %v", got, input)
		}
	})
	t.Run("invalid UUID returns error", func(t *testing.T) {
		_, err := parseOrNewUUID("not-a-uuid")
		if err == nil {
			t.Fatal("expected error for invalid UUID")
		}
	})
}

func TestPublishedPodQuestionAnswerStateChanged(t *testing.T) {
	existing := database.ListPublishedPodQuestionsByTaskIDsRow{
		Title:         "What is 2+2?",
		AnswerOutline: "4",
	}

	t.Run("no change returns false", func(t *testing.T) {
		next := normalizedPublishPodQuestion{Title: "What is 2+2?", AnswerOutline: "4"}
		if publishedPodQuestionAnswerStateChanged(existing, next) {
			t.Error("expected false for unchanged question")
		}
	})
	t.Run("title change returns true", func(t *testing.T) {
		next := normalizedPublishPodQuestion{Title: "What is 3+3?", AnswerOutline: "4"}
		if !publishedPodQuestionAnswerStateChanged(existing, next) {
			t.Error("expected true for title change")
		}
	})
	t.Run("answer change returns true", func(t *testing.T) {
		next := normalizedPublishPodQuestion{Title: "What is 2+2?", AnswerOutline: "five"}
		if !publishedPodQuestionAnswerStateChanged(existing, next) {
			t.Error("expected true for answer change")
		}
	})
	t.Run("case-insensitive answer match returns false", func(t *testing.T) {
		next := normalizedPublishPodQuestion{Title: "What is 2+2?", AnswerOutline: "4"}
		if publishedPodQuestionAnswerStateChanged(existing, next) {
			t.Error("expected false for case-insensitive match")
		}
	})
}

func TestInvalidPublishPod(t *testing.T) {
	err := invalidPublishPod("test message")
	if err == nil {
		t.Fatal("expected non-nil error")
	}
	if err.Status != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want %d", err.Status, http.StatusUnprocessableEntity)
	}
	if err.UserMessage != "test message" {
		t.Errorf("UserMessage = %q, want %q", err.UserMessage, "test message")
	}
}

func TestChildInsertError(t *testing.T) {
	inner := fmt.Errorf("db failure")
	err := childInsertError("insert tasks", inner)
	if err == nil {
		t.Fatal("expected non-nil error")
	}
	if err.Status != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", err.Status, http.StatusInternalServerError)
	}
	if err.Operation != "insert tasks" {
		t.Errorf("Operation = %q, want %q", err.Operation, "insert tasks")
	}
	if err.Err != inner {
		t.Errorf("Err = %v, want %v", err.Err, inner)
	}
}

func TestPublishedPodTemplateIDs(t *testing.T) {
	id1 := uuid.New()
	id2 := uuid.New()

	t.Run("extracts non-nil IDs", func(t *testing.T) {
		vms := []normalizedPublishPodVM{
			{SourceInventoryItemID: id1},
			{SourceInventoryItemID: id2},
		}
		got := publishedPodTemplateIDs(vms)
		if len(got) != 2 {
			t.Fatalf("len = %d, want 2", len(got))
		}
	})
	t.Run("skips nil UUIDs", func(t *testing.T) {
		vms := []normalizedPublishPodVM{
			{SourceInventoryItemID: id1},
			{SourceInventoryItemID: uuid.Nil},
			{SourceInventoryItemID: id2},
		}
		got := publishedPodTemplateIDs(vms)
		if len(got) != 2 {
			t.Fatalf("len = %d, want 2", len(got))
		}
	})
	t.Run("empty input", func(t *testing.T) {
		got := publishedPodTemplateIDs(nil)
		if len(got) != 0 {
			t.Fatalf("len = %d, want 0", len(got))
		}
	})
}

func TestNewPublishedPodTemplateIDs(t *testing.T) {
	id1 := uuid.New()
	id2 := uuid.New()
	id3 := uuid.New()

	existing := []database.ListPublishedPodVMsByPodIDsRow{
		{SourceInventoryItemID: id1},
	}

	t.Run("excludes existing", func(t *testing.T) {
		vms := []normalizedPublishPodVM{
			{SourceInventoryItemID: id1},
			{SourceInventoryItemID: id2},
			{SourceInventoryItemID: id3},
		}
		got := newPublishedPodTemplateIDs(vms, existing)
		if len(got) != 2 {
			t.Fatalf("len = %d, want 2", len(got))
		}
	})
	t.Run("skips nil UUIDs", func(t *testing.T) {
		vms := []normalizedPublishPodVM{
			{SourceInventoryItemID: uuid.Nil},
			{SourceInventoryItemID: id2},
		}
		got := newPublishedPodTemplateIDs(vms, existing)
		if len(got) != 1 {
			t.Fatalf("len = %d, want 1", len(got))
		}
	})
}

func TestMarkSelectedUpdateVM(t *testing.T) {
	id1 := uuid.New()
	id2 := uuid.New()
	id3 := uuid.New()
	selected := map[uuid.UUID]struct{}{id1: {}, id2: {}}

	t.Run("marks matching IDs", func(t *testing.T) {
		matched := make(map[uuid.UUID]struct{})
		got := markSelectedUpdateVM(selected, matched, id1, id3)
		if !got {
			t.Error("expected true")
		}
		if _, ok := matched[id1]; !ok {
			t.Error("expected id1 in matched")
		}
		if _, ok := matched[id3]; ok {
			t.Error("id3 should not be in matched")
		}
	})
	t.Run("returns false when no match", func(t *testing.T) {
		matched := make(map[uuid.UUID]struct{})
		got := markSelectedUpdateVM(selected, matched, id3)
		if got {
			t.Error("expected false")
		}
	})
}

func TestNonNilPrincipals(t *testing.T) {
	t.Run("nil returns empty slice", func(t *testing.T) {
		got := nonNilPrincipals(nil)
		if got == nil || len(got) != 0 {
			t.Errorf("expected empty non-nil slice, got %v", got)
		}
	})
	t.Run("non-nil passes through", func(t *testing.T) {
		input := []publishedPodPrincipalResponse{{ID: uuid.New()}}
		got := nonNilPrincipals(input)
		if len(got) != 1 {
			t.Errorf("len = %d, want 1", len(got))
		}
	})
}

func TestNonNilVMs(t *testing.T) {
	t.Run("nil returns empty slice", func(t *testing.T) {
		got := nonNilVMs(nil)
		if got == nil || len(got) != 0 {
			t.Errorf("expected empty non-nil slice, got %v", got)
		}
	})
	t.Run("non-nil passes through", func(t *testing.T) {
		input := []publishedPodVMResponse{{Name: "vm1"}}
		got := nonNilVMs(input)
		if len(got) != 1 {
			t.Errorf("len = %d, want 1", len(got))
		}
	})
}

func TestInventoryPath(t *testing.T) {
	rootID := uuid.New()
	childID := uuid.New()
	grandchildID := uuid.New()

	rows := map[uuid.UUID]database.GetVisibleInventoryItemsForPrincipalRow{
		rootID:       {Name: "Root"},
		childID:      {Name: "Child", ParentID: &rootID},
		grandchildID: {Name: "Grandchild", ParentID: &childID},
	}

	t.Run("single level", func(t *testing.T) {
		got := inventoryPath(rootID, rows)
		if got != "Root" {
			t.Errorf("got %q, want %q", got, "Root")
		}
	})
	t.Run("multi level", func(t *testing.T) {
		got := inventoryPath(grandchildID, rows)
		if got != "Root / Child / Grandchild" {
			t.Errorf("got %q, want %q", got, "Root / Child / Grandchild")
		}
	})
	t.Run("missing ID returns empty", func(t *testing.T) {
		got := inventoryPath(uuid.New(), rows)
		if got != "" {
			t.Errorf("got %q, want empty", got)
		}
	})
}

func TestPublishedPrincipal(t *testing.T) {
	id := uuid.New()

	t.Run("uses name over external ID for label", func(t *testing.T) {
		name := "Alice"
		got := publishedPrincipal(id, database.PrincipalTypeUser, "alice@ad", &name, nil, nil)
		if got.Label != "Alice" {
			t.Errorf("Label = %q, want %q", got.Label, "Alice")
		}
	})
	t.Run("falls back to external ID for label", func(t *testing.T) {
		got := publishedPrincipal(id, database.PrincipalTypeUser, "alice@ad", nil, nil, nil)
		if got.Label != "alice@ad" {
			t.Errorf("Label = %q, want %q", got.Label, "alice@ad")
		}
	})
	t.Run("empty name falls back to external ID", func(t *testing.T) {
		empty := "  "
		got := publishedPrincipal(id, database.PrincipalTypeUser, "alice@ad", &empty, nil, nil)
		if got.Label != "alice@ad" {
			t.Errorf("Label = %q, want %q", got.Label, "alice@ad")
		}
	})
	t.Run("formats combined full name label", func(t *testing.T) {
		name := "mcaron"
		fullName := "Maxwell Caron"
		got := publishedPrincipal(id, database.PrincipalTypeUser, "mcaron@ad", &name, &fullName, nil)
		if got.Label != "mcaron (Maxwell Caron)" {
			t.Errorf("Label = %q, want %q", got.Label, "mcaron (Maxwell Caron)")
		}
	})
	t.Run("suppresses duplicate full name label", func(t *testing.T) {
		name := "mcaron"
		fullName := "MCARON"
		got := publishedPrincipal(id, database.PrincipalTypeUser, "mcaron@ad", &name, &fullName, nil)
		if got.Label != "mcaron" {
			t.Errorf("Label = %q, want %q", got.Label, "mcaron")
		}
	})
	t.Run("uses description over external ID", func(t *testing.T) {
		desc := "Lab admin"
		got := publishedPrincipal(id, database.PrincipalTypeGroup, "grp-001", nil, nil, &desc)
		if got.Description != "Lab admin" {
			t.Errorf("Description = %q, want %q", got.Description, "Lab admin")
		}
	})
	t.Run("falls back to external ID for description", func(t *testing.T) {
		got := publishedPrincipal(id, database.PrincipalTypeGroup, "grp-001", nil, nil, nil)
		if got.Description != "grp-001" {
			t.Errorf("Description = %q, want %q", got.Description, "grp-001")
		}
	})
}

// helpers
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstr(s, substr))
}

func containsSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Suppress unused import warnings
var _ = math.MaxInt32
