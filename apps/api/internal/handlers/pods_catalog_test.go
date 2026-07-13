package handlers

import (
	"math"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

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
