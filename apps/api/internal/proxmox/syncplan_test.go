package proxmox

import (
	"errors"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

func TestSyncVMKeyRoundTrip(t *testing.T) {
	tests := []struct {
		name string
		node string
		vmid int
	}{
		{name: "simple", node: "pve1", vmid: 100},
		{name: "node with slash", node: "pve/cluster", vmid: 42},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			key := syncVMKey(tc.node, tc.vmid)
			gotNode, gotVMID := splitVMKey(key)
			if gotNode != tc.node || gotVMID != tc.vmid {
				t.Fatalf("splitVMKey(%q) = (%q, %d), want (%q, %d)", key, gotNode, gotVMID, tc.node, tc.vmid)
			}
		})
	}
}

func TestComputeSyncDiff(t *testing.T) {
	itemID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	parentID := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	nodePve1 := "pve1"
	nodePve2 := "pve2"
	vmid100 := int32(100)

	dbVM := func(id uuid.UUID, node string, vmid int32, name string, isTemplate bool) database.GetAllInventoryItemsRow {
		tmpl := isTemplate
		return database.GetAllInventoryItemsRow{
			ID:         id,
			ParentID:   &parentID,
			Kind:       database.InventoryItemKindVm,
			Name:       name,
			Node:       &node,
			Vmid:       &vmid,
			IsTemplate: &tmpl,
		}
	}

	noopBlockers := func(uuid.UUID) ([]string, error) { return nil, nil }

	tests := []struct {
		name       string
		vms        []VM
		dbRows     []database.GetAllInventoryItemsRow
		blockersFn func(id uuid.UUID) ([]string, error)
		want       SyncDiff
		wantErr    bool
	}{
		{
			name:       "empty both sides",
			vms:        nil,
			dbRows:     nil,
			blockersFn: noopBlockers,
			want: SyncDiff{
				ProxmoxVMCount: 0,
			},
		},
		{
			name: "add vm present in proxmox absent from db",
			vms: []VM{{
				Node: "pve1", VMID: 100, Name: "new-vm", Pool: "students",
				Template: 0,
			}},
			dbRows:     nil,
			blockersFn: noopBlockers,
			want: SyncDiff{
				ProxmoxVMCount: 1,
				Adds: []SyncChange{{
					ID: "pve1/100", Kind: SyncChangeAdd,
					Node: "pve1", VMID: 100, Name: "new-vm",
					IsTemplate: false, Pool: "students",
				}},
			},
		},
		{
			name:   "empty proxmox with db vms suppresses removes",
			vms:    nil,
			dbRows: []database.GetAllInventoryItemsRow{dbVM(itemID, nodePve1, vmid100, "gone-vm", false)},
			blockersFn: func(id uuid.UUID) ([]string, error) {
				t.Fatal("blockersFn should not be called when removes are suppressed")
				return nil, nil
			},
			want: SyncDiff{
				ProxmoxVMCount: 0,
				Warning: "Proxmox returned zero VMs. This may indicate a connectivity problem. " +
					"Removals are suppressed until Proxmox reports live inventory.",
			},
		},
		{
			name: "remove removable",
			vms:  []VM{{Node: "pve1", VMID: 200, Name: "other"}},
			dbRows: []database.GetAllInventoryItemsRow{
				dbVM(itemID, nodePve1, vmid100, "gone-vm", false),
			},
			blockersFn: noopBlockers,
			want: SyncDiff{
				ProxmoxVMCount: 1,
				Adds: []SyncChange{{
					ID: "pve1/200", Kind: SyncChangeAdd,
					Node: "pve1", VMID: 200, Name: "other",
				}},
				Removes: []SyncChange{{
					ID: "pve1/100", Kind: SyncChangeRemove,
					Node: "pve1", VMID: 100, Name: "gone-vm",
					Removable: true, ItemID: itemID, ParentID: &parentID,
				}},
			},
		},
		{
			name: "remove blocked",
			vms:  []VM{{Node: "pve1", VMID: 200, Name: "other"}},
			dbRows: []database.GetAllInventoryItemsRow{
				dbVM(itemID, nodePve1, vmid100, "blocked-vm", false),
			},
			blockersFn: func(uuid.UUID) ([]string, error) {
				return []string{"has active clone"}, nil
			},
			want: SyncDiff{
				ProxmoxVMCount: 1,
				Adds: []SyncChange{{
					ID: "pve1/200", Kind: SyncChangeAdd,
					Node: "pve1", VMID: 200, Name: "other",
				}},
				Removes: []SyncChange{{
					ID: "pve1/100", Kind: SyncChangeRemove,
					Node: "pve1", VMID: 100, Name: "blocked-vm",
					Removable: false, Blockers: []string{"has active clone"},
					ItemID: itemID, ParentID: &parentID,
				}},
			},
		},
		{
			name: "blockersFn error propagates",
			vms:  []VM{{Node: "pve1", VMID: 200, Name: "other"}},
			dbRows: []database.GetAllInventoryItemsRow{
				dbVM(itemID, nodePve1, vmid100, "gone-vm", false),
			},
			blockersFn: func(uuid.UUID) ([]string, error) {
				return nil, errors.New("db unavailable")
			},
			wantErr: true,
		},
		{
			name: "update name change",
			vms:  []VM{{Node: "pve1", VMID: 100, Name: "renamed"}},
			dbRows: []database.GetAllInventoryItemsRow{
				dbVM(itemID, nodePve1, vmid100, "old-name", false),
			},
			blockersFn: noopBlockers,
			want: SyncDiff{
				ProxmoxVMCount: 1,
				Updates: []SyncChange{{
					ID: "pve1/100", Kind: SyncChangeUpdate,
					Node: "pve1", VMID: 100, Name: "renamed",
					Fields: []SyncFieldChange{{
						Field: "name", From: "old-name", To: "renamed",
					}},
					ItemID: itemID, ParentID: &parentID,
				}},
			},
		},
		{
			name: "update template flag change",
			vms:  []VM{{Node: "pve1", VMID: 100, Name: "tpl-vm", Template: 1}},
			dbRows: []database.GetAllInventoryItemsRow{
				dbVM(itemID, nodePve1, vmid100, "tpl-vm", false),
			},
			blockersFn: noopBlockers,
			want: SyncDiff{
				ProxmoxVMCount: 1,
				Updates: []SyncChange{{
					ID: "pve1/100", Kind: SyncChangeUpdate,
					Node: "pve1", VMID: 100, Name: "tpl-vm", IsTemplate: true,
					Fields: []SyncFieldChange{{
						Field: "template", From: "false", To: "true",
					}},
					ItemID: itemID, ParentID: &parentID,
				}},
			},
		},
		{
			name: "no-op identical vm",
			vms:  []VM{{Node: "pve1", VMID: 100, Name: "same", Template: 0}},
			dbRows: []database.GetAllInventoryItemsRow{
				dbVM(itemID, nodePve1, vmid100, "same", false),
			},
			blockersFn: noopBlockers,
			want: SyncDiff{
				ProxmoxVMCount: 1,
			},
		},
		{
			name: "node move is add plus remove",
			vms:  []VM{{Node: nodePve2, VMID: 100, Name: "moved"}},
			dbRows: []database.GetAllInventoryItemsRow{
				dbVM(itemID, nodePve1, vmid100, "moved", false),
			},
			blockersFn: noopBlockers,
			want: SyncDiff{
				ProxmoxVMCount: 1,
				Adds: []SyncChange{{
					ID: "pve2/100", Kind: SyncChangeAdd,
					Node: nodePve2, VMID: 100, Name: "moved",
				}},
				Removes: []SyncChange{{
					ID: "pve1/100", Kind: SyncChangeRemove,
					Node: nodePve1, VMID: 100, Name: "moved",
					Removable: true, ItemID: itemID, ParentID: &parentID,
				}},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := computeSyncDiff(tc.vms, tc.dbRows, tc.blockersFn)
			if tc.wantErr {
				if err == nil {
					t.Fatal("computeSyncDiff() error = nil, want error")
				}
				return
			}
			if err != nil {
				t.Fatalf("computeSyncDiff() error = %v", err)
			}

			assertSyncDiffEqual(t, tc.want, got)
		})
	}
}

func TestComputeSyncDiffBlockersFnCallDiscipline(t *testing.T) {
	itemID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	parentID := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
	node := "pve1"
	vmid := int32(100)
	isTemplate := false

	dbRow := database.GetAllInventoryItemsRow{
		ID:         itemID,
		ParentID:   &parentID,
		Kind:       database.InventoryItemKindVm,
		Name:       "stale",
		Node:       &node,
		Vmid:       &vmid,
		IsTemplate: &isTemplate,
	}

	var called []uuid.UUID
	blockersFn := func(id uuid.UUID) ([]string, error) {
		called = append(called, id)
		return nil, nil
	}

	vms := []VM{
		{Node: "pve1", VMID: 100, Name: "updated"},
		{Node: "pve1", VMID: 200, Name: "brand-new"},
	}
	existingID := uuid.MustParse("cccccccc-cccc-cccc-cccc-cccccccccccc")
	dbRows := []database.GetAllInventoryItemsRow{
		dbRow,
		{
			ID:         existingID,
			ParentID:   &parentID,
			Kind:       database.InventoryItemKindVm,
			Name:       "same",
			Node:       new("pve1"),
			Vmid:       new(int32(200)),
			IsTemplate: &isTemplate,
		},
	}

	_, err := computeSyncDiff(vms, dbRows, blockersFn)
	if err != nil {
		t.Fatalf("computeSyncDiff() error = %v", err)
	}

	if len(called) != 0 {
		t.Fatalf("blockersFn called %d times, want 0 (no removes when only updates/adds)", len(called))
	}

	// Now include a DB-only VM to trigger a remove call.
	dbRows = append(dbRows, database.GetAllInventoryItemsRow{
		ID:         uuid.MustParse("dddddddd-dddd-dddd-dddd-dddddddddddd"),
		ParentID:   &parentID,
		Kind:       database.InventoryItemKindVm,
		Name:       "orphan",
		Node:       new("pve1"),
		Vmid:       new(int32(300)),
		IsTemplate: &isTemplate,
	})

	orphanID := uuid.MustParse("dddddddd-dddd-dddd-dddd-dddddddddddd")
	called = nil

	_, err = computeSyncDiff(vms, dbRows, blockersFn)
	if err != nil {
		t.Fatalf("computeSyncDiff() error = %v", err)
	}

	if len(called) != 1 {
		t.Fatalf("blockersFn called %d times, want 1", len(called))
	}
	if called[0] != orphanID {
		t.Fatalf("blockersFn called with %s, want %s", called[0], orphanID)
	}
}

func assertSyncDiffEqual(t *testing.T, want, got SyncDiff) {
	t.Helper()

	if got.ProxmoxVMCount != want.ProxmoxVMCount {
		t.Errorf("ProxmoxVMCount = %d, want %d", got.ProxmoxVMCount, want.ProxmoxVMCount)
	}
	if got.Warning != want.Warning {
		t.Errorf("Warning = %q, want %q", got.Warning, want.Warning)
	}

	assertSyncChangesEqual(t, "Adds", want.Adds, got.Adds)
	assertSyncChangesEqual(t, "Removes", want.Removes, got.Removes)
	assertSyncChangesEqual(t, "Updates", want.Updates, got.Updates)
}

func assertSyncChangesEqual(t *testing.T, label string, want, got []SyncChange) {
	t.Helper()

	if len(want) != len(got) {
		t.Fatalf("%s: len = %d, want %d\ngot:  %+v\nwant: %+v", label, len(got), len(want), got, want)
	}

	for i := range want {
		w, g := want[i], got[i]
		if w.ID != g.ID || w.Kind != g.Kind || w.Node != g.Node || w.VMID != g.VMID ||
			w.Name != g.Name || w.IsTemplate != g.IsTemplate || w.Pool != g.Pool ||
			w.Removable != g.Removable || w.ItemID != g.ItemID {
			t.Errorf("%s[%d]: change mismatch\ngot:  %+v\nwant: %+v", label, i, g, w)
		}
		if len(w.Blockers) != len(g.Blockers) {
			t.Errorf("%s[%d].Blockers len = %d, want %d", label, i, len(g.Blockers), len(w.Blockers))
			continue
		}
		for j := range w.Blockers {
			if g.Blockers[j] != w.Blockers[j] {
				t.Errorf("%s[%d].Blockers[%d] = %q, want %q", label, i, j, g.Blockers[j], w.Blockers[j])
			}
		}
		if len(w.Fields) != len(g.Fields) {
			t.Errorf("%s[%d].Fields len = %d, want %d", label, i, len(g.Fields), len(w.Fields))
			continue
		}
		for j := range w.Fields {
			if g.Fields[j] != w.Fields[j] {
				t.Errorf("%s[%d].Fields[%d] = %+v, want %+v", label, i, j, g.Fields[j], w.Fields[j])
			}
		}
		if (w.ParentID == nil) != (g.ParentID == nil) {
			t.Errorf("%s[%d].ParentID nil mismatch", label, i)
		} else if w.ParentID != nil && *w.ParentID != *g.ParentID {
			t.Errorf("%s[%d].ParentID = %s, want %s", label, i, *g.ParentID, *w.ParentID)
		}
	}
}
