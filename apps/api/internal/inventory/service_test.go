package inventory

import (
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

func folderRow(id, parentID *uuid.UUID, name string, allowedMask, deniedMask int64, inherit bool) database.GetVisibleInventoryItemsForPrincipalRow {
	row := database.GetVisibleInventoryItemsForPrincipalRow{
		ID:                 *id,
		Kind:               database.InventoryItemKindFolder,
		Name:               name,
		InheritPermissions: inherit,
		AllowedMask:        allowedMask,
		DeniedMask:         deniedMask,
	}
	if parentID != nil {
		row.ParentID = parentID
	}
	return row
}

func vmRow(id, parentID *uuid.UUID, name string, allowedMask, deniedMask int64, inherit bool) database.GetVisibleInventoryItemsForPrincipalRow {
	row := database.GetVisibleInventoryItemsForPrincipalRow{
		ID:                 *id,
		Kind:               database.InventoryItemKindVm,
		Name:               name,
		InheritPermissions: inherit,
		AllowedMask:        allowedMask,
		DeniedMask:         deniedMask,
	}
	if parentID != nil {
		row.ParentID = parentID
	}
	return row
}

func allFolderRow(id, parentID *uuid.UUID, name string) database.GetAllInventoryItemsRow {
	row := database.GetAllInventoryItemsRow{
		ID:   *id,
		Kind: database.InventoryItemKindFolder,
		Name: name,
	}
	if parentID != nil {
		row.ParentID = parentID
	}
	return row
}

func allVMRow(id, parentID *uuid.UUID, name string) database.GetAllInventoryItemsRow {
	row := database.GetAllInventoryItemsRow{
		ID:   *id,
		Kind: database.InventoryItemKindVm,
		Name: name,
	}
	if parentID != nil {
		row.ParentID = parentID
	}
	return row
}

func ptr(u uuid.UUID) *uuid.UUID { return &u }

// TestExpandVisibleInventoryRows_AncestorSynthesis: a VM nested two folders
// deep, only the VM is in visibleRows → result contains VM and both ancestor
// folders with zeroed masks.
func TestExpandVisibleInventoryRows_AncestorSynthesis(t *testing.T) {
	grandparentID := uuid.New()
	parentID := uuid.New()
	vmID := uuid.New()

	vm := vmRow(ptr(vmID), ptr(parentID), "my-vm", 1, 0, false)

	allRows := []database.GetAllInventoryItemsRow{
		allFolderRow(ptr(grandparentID), nil, "root"),
		allFolderRow(ptr(parentID), ptr(grandparentID), "parent"),
		allVMRow(ptr(vmID), ptr(parentID), "my-vm"),
	}

	result := expandVisibleInventoryRows([]database.GetVisibleInventoryItemsForPrincipalRow{vm}, allRows)

	if len(result) != 3 {
		t.Fatalf("expected 3 rows (vm + 2 ancestor folders), got %d", len(result))
	}

	byID := make(map[uuid.UUID]database.GetVisibleInventoryItemsForPrincipalRow)
	for _, r := range result {
		byID[r.ID] = r
	}

	// VM should be present unchanged
	if _, ok := byID[vmID]; !ok {
		t.Error("vm not present in result")
	}

	// Synthesized ancestor checks
	for _, ancestorID := range []uuid.UUID{grandparentID, parentID} {
		ancestor, ok := byID[ancestorID]
		if !ok {
			t.Errorf("ancestor %v not in result", ancestorID)
			continue
		}
		if ancestor.AllowedMask != 0 {
			t.Errorf("synthesized ancestor AllowedMask = %d, want 0", ancestor.AllowedMask)
		}
		if ancestor.DeniedMask != 0 {
			t.Errorf("synthesized ancestor DeniedMask = %d, want 0", ancestor.DeniedMask)
		}
		if !ancestor.InheritPermissions {
			t.Errorf("synthesized ancestor InheritPermissions = false, want true")
		}
	}
}

// TestExpandVisibleInventoryRows_NoDuplicates: a parent folder appears in
// visibleRows directly AND as an ancestor of another visible row — it must
// appear exactly once, keeping its real masks.
func TestExpandVisibleInventoryRows_NoDuplicates(t *testing.T) {
	parentID := uuid.New()
	vmID := uuid.New()

	parent := folderRow(ptr(parentID), nil, "parent-folder", 7, 0, false)
	vm := vmRow(ptr(vmID), ptr(parentID), "child-vm", 1, 0, false)

	allRows := []database.GetAllInventoryItemsRow{
		allFolderRow(ptr(parentID), nil, "parent-folder"),
		allVMRow(ptr(vmID), ptr(parentID), "child-vm"),
	}

	result := expandVisibleInventoryRows(
		[]database.GetVisibleInventoryItemsForPrincipalRow{parent, vm},
		allRows,
	)

	count := 0
	var kept database.GetVisibleInventoryItemsForPrincipalRow
	for _, r := range result {
		if r.ID == parentID {
			count++
			kept = r
		}
	}

	if count != 1 {
		t.Errorf("parent folder appears %d times, want 1", count)
	}
	if kept.AllowedMask != 7 {
		t.Errorf("kept parent AllowedMask = %d, want 7 (original masks preserved)", kept.AllowedMask)
	}
}

// TestExpandVisibleInventoryRows_MissingParent: visible row with a ParentID
// not in allRows must not panic and must still be returned.
func TestExpandVisibleInventoryRows_MissingParent(t *testing.T) {
	missingParentID := uuid.New()
	vmID := uuid.New()

	vm := vmRow(ptr(vmID), ptr(missingParentID), "orphan-vm", 1, 0, false)
	allRows := []database.GetAllInventoryItemsRow{
		allVMRow(ptr(vmID), ptr(missingParentID), "orphan-vm"),
	}

	var result []database.GetVisibleInventoryItemsForPrincipalRow
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("expandVisibleInventoryRows panicked: %v", r)
		}
	}()

	result = expandVisibleInventoryRows([]database.GetVisibleInventoryItemsForPrincipalRow{vm}, allRows)

	if len(result) != 1 {
		t.Errorf("expected 1 row (the orphan vm), got %d", len(result))
	}
	if result[0].ID != vmID {
		t.Errorf("result row ID = %v, want %v", result[0].ID, vmID)
	}
}

// TestExpandVisibleInventoryRows_SortOrder: folders sort before VMs;
// names compare case-insensitively.
func TestExpandVisibleInventoryRows_SortOrder(t *testing.T) {
	idA := uuid.New()
	idB := uuid.New()
	idC := uuid.New()
	idVM := uuid.New()

	// Folders: "Beta" and "alpha" — case-insensitive sort should put alpha first.
	folderAlpha := folderRow(ptr(idA), nil, "alpha", 1, 0, false)
	folderBeta := folderRow(ptr(idB), nil, "Beta", 1, 0, false)
	folderZeta := folderRow(ptr(idC), nil, "zeta", 1, 0, false)
	vm := vmRow(ptr(idVM), nil, "a-vm", 1, 0, false)

	visibleRows := []database.GetVisibleInventoryItemsForPrincipalRow{folderZeta, vm, folderBeta, folderAlpha}
	allRows := []database.GetAllInventoryItemsRow{
		allFolderRow(ptr(idA), nil, "alpha"),
		allFolderRow(ptr(idB), nil, "Beta"),
		allFolderRow(ptr(idC), nil, "zeta"),
		allVMRow(ptr(idVM), nil, "a-vm"),
	}

	result := expandVisibleInventoryRows(visibleRows, allRows)

	if len(result) != 4 {
		t.Fatalf("expected 4 rows, got %d", len(result))
	}

	// First three must be folders in case-insensitive name order.
	wantOrder := []struct {
		id   uuid.UUID
		kind database.InventoryItemKind
	}{
		{idA, database.InventoryItemKindFolder}, // alpha
		{idB, database.InventoryItemKindFolder}, // Beta
		{idC, database.InventoryItemKindFolder}, // zeta
		{idVM, database.InventoryItemKindVm},    // a-vm
	}

	for i, want := range wantOrder {
		if result[i].ID != want.id || result[i].Kind != want.kind {
			t.Errorf("result[%d] = {ID:%v Kind:%v}, want {ID:%v Kind:%v}",
				i, result[i].ID, result[i].Kind, want.id, want.kind)
		}
	}
}

// TestExpandVisibleInventoryRows_EmptyInput: empty visibleRows returns empty (non-nil ok) slice.
func TestExpandVisibleInventoryRows_EmptyInput(t *testing.T) {
	result := expandVisibleInventoryRows(
		[]database.GetVisibleInventoryItemsForPrincipalRow{},
		[]database.GetAllInventoryItemsRow{},
	)
	if result == nil {
		// nil is acceptable per the plan
		return
	}
	if len(result) != 0 {
		t.Errorf("expected empty result, got %d rows", len(result))
	}
}
