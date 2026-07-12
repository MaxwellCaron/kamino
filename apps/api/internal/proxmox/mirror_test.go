package proxmox

import (
	"reflect"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

func TestEncodeDecodePoolPathRoundTrip(t *testing.T) {
	tests := []struct {
		name string
		path []string
		want []string
	}{
		{name: "empty slice encodes to empty string", path: []string{}, want: []string{""}},
		{name: "single segment", path: []string{"students"}, want: []string{"students"}},
		{name: "nested path", path: []string{"pods", "team-a", "lab"}, want: []string{"pods", "team-a", "lab"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			encoded := EncodePoolPath(tc.path)
			decoded := decodePoolPath(encoded)
			if !reflect.DeepEqual(decoded, tc.want) {
				t.Fatalf("decodePoolPath(%q) = %#v, want %#v", encoded, decoded, tc.want)
			}
		})
	}

	t.Run("nil slice encodes like empty", func(t *testing.T) {
		if got := EncodePoolPath(nil); got != "" {
			t.Fatalf("EncodePoolPath(nil) = %q, want empty string", got)
		}
	})
}

func TestDecodePoolPathSeparatorInSegment(t *testing.T) {
	// EncodePoolPath joins with "/" and decodePoolPath splits on "/" with no escaping.
	path := []string{"a/b", "c"}
	encoded := EncodePoolPath(path)
	decoded := decodePoolPath(encoded)

	want := []string{"a", "b", "c"}
	if !reflect.DeepEqual(decoded, want) {
		t.Fatalf("decodePoolPath(%q) = %#v, want %#v (segment slash is not preserved)", encoded, decoded, want)
	}
}

func TestBuildInventoryIndex(t *testing.T) {
	rootID := uuid.MustParse("10000000-0000-0000-0000-000000000001")
	folderID := uuid.MustParse("20000000-0000-0000-0000-000000000002")
	vmID := uuid.MustParse("30000000-0000-0000-0000-000000000003")
	node := "pve1"
	vmid := int32(101)

	rows := []database.GetAllInventoryItemsRow{
		{
			ID:   rootID,
			Kind: database.InventoryItemKindFolder,
			Name: RootFolderName,
		},
		{
			ID:       folderID,
			ParentID: &rootID,
			Kind:     database.InventoryItemKindFolder,
			Name:     "students",
		},
		{
			ID:       vmID,
			ParentID: &folderID,
			Kind:     database.InventoryItemKindVm,
			Name:     "vm-101",
			Node:     &node,
			Vmid:     &vmid,
		},
	}

	gotRoot, itemsByID, childrenByParent := buildInventoryIndex(rows)

	if gotRoot == nil || *gotRoot != rootID {
		t.Fatalf("root ID = %v, want %s", gotRoot, rootID)
	}

	if len(itemsByID) != 3 {
		t.Fatalf("itemsByID len = %d, want 3", len(itemsByID))
	}
	for _, id := range []uuid.UUID{rootID, folderID, vmID} {
		if _, ok := itemsByID[id]; !ok {
			t.Fatalf("itemsByID missing %s", id)
		}
	}

	wantChildren := map[uuid.UUID][]uuid.UUID{
		rootID:   {folderID},
		folderID: {vmID},
	}
	for parent, wantKids := range wantChildren {
		gotKids := childrenByParent[parent]
		if !reflect.DeepEqual(gotKids, wantKids) {
			t.Fatalf("childrenByParent[%s] = %v, want %v", parent, gotKids, wantKids)
		}
	}
}

func TestPoolDepth(t *testing.T) {
	tests := []struct {
		poolID string
		want   int
	}{
		{poolID: "", want: 0},
		{poolID: "students", want: 0},
		{poolID: "pods/team-a", want: 1},
		{poolID: "pods/team-a/lab", want: 2},
	}

	for _, tc := range tests {
		t.Run(tc.poolID, func(t *testing.T) {
			if got := poolDepth(tc.poolID); got != tc.want {
				t.Fatalf("poolDepth(%q) = %d, want %d", tc.poolID, got, tc.want)
			}
		})
	}
}

func TestSortedPoolIDsByDepth(t *testing.T) {
	pools := map[string]struct{}{
		"pods":            {},
		"pods/team-a":     {},
		"pods/team-a/lab": {},
		"students":        {},
	}

	t.Run("deepest first", func(t *testing.T) {
		got := sortedPoolIDsByDepth(pools, true)
		want := []string{"pods/team-a/lab", "pods/team-a", "pods", "students"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("sortedPoolIDsByDepth(deepestFirst=true) = %v, want %v", got, want)
		}
	})

	t.Run("shallowest first", func(t *testing.T) {
		got := sortedPoolIDsByDepth(pools, false)
		want := []string{"pods", "students", "pods/team-a", "pods/team-a/lab"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("sortedPoolIDsByDepth(deepestFirst=false) = %v, want %v", got, want)
		}
	})
}

func TestFinalPoolVMCounts(t *testing.T) {
	keyA := vmKey{Node: "pve1", VMID: 101, GuestType: GuestQEMU}
	keyB := vmKey{Node: "pve1", VMID: 102, GuestType: GuestQEMU}
	keyC := vmKey{Node: "pve1", VMID: 103, GuestType: GuestQEMU}

	t.Run("tracked VM moving pools counts toward desired pool", func(t *testing.T) {
		current := map[vmKey]string{keyA: "old-pool"}
		desired := map[vmKey]string{keyA: "new-pool"}
		got := finalPoolVMCounts(current, desired)
		want := map[string]int{"new-pool": 1}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("finalPoolVMCounts() = %v, want %v", got, want)
		}
	})

	t.Run("untracked VM counts toward current pool", func(t *testing.T) {
		current := map[vmKey]string{keyB: "orphan-pool"}
		got := finalPoolVMCounts(current, nil)
		want := map[string]int{"orphan-pool": 1}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("finalPoolVMCounts() = %v, want %v", got, want)
		}
	})

	t.Run("root placement VMs are not counted", func(t *testing.T) {
		current := map[vmKey]string{keyC: "stale-pool"}
		desired := map[vmKey]string{keyC: ""}
		got := finalPoolVMCounts(current, desired)
		if len(got) != 0 {
			t.Fatalf("finalPoolVMCounts() = %v, want empty map", got)
		}
	})
}

func TestStalePoolIDs(t *testing.T) {
	desired := map[string]struct{}{
		"students": {},
	}

	t.Run("desired pools are never returned", func(t *testing.T) {
		pools := []Pool{{PoolID: "students"}}
		got := stalePoolIDs(pools, desired, nil)
		if len(got) != 0 {
			t.Fatalf("stalePoolIDs() = %v, want empty", got)
		}
	})

	t.Run("empty undesired leaf pool is returned", func(t *testing.T) {
		pools := []Pool{{PoolID: "orphan"}}
		got := stalePoolIDs(pools, desired, nil)
		want := []string{"orphan"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("stalePoolIDs() = %v, want %v", got, want)
		}
	})

	t.Run("nested undesired chain deepest-first", func(t *testing.T) {
		pools := []Pool{
			{PoolID: "a"},
			{PoolID: "a/b"},
			{PoolID: "a/b/c"},
		}
		got := stalePoolIDs(pools, desired, nil)
		want := []string{"a/b/c", "a/b", "a"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("stalePoolIDs() = %v, want %v", got, want)
		}
	})

	t.Run("pool with remaining VM is kept with empty ancestor", func(t *testing.T) {
		pools := []Pool{
			{PoolID: "parent"},
			{PoolID: "parent/child"},
		}
		counts := map[string]int{"parent/child": 1}
		got := stalePoolIDs(pools, desired, counts)
		if len(got) != 0 {
			t.Fatalf("stalePoolIDs() = %v, want empty", got)
		}
	})

	t.Run("parent kept when child pool is desired", func(t *testing.T) {
		pools := []Pool{
			{PoolID: "parent"},
			{PoolID: "parent/child"},
		}
		desiredWithChild := map[string]struct{}{
			"parent/child": {},
		}
		got := stalePoolIDs(pools, desiredWithChild, nil)
		if len(got) != 0 {
			t.Fatalf("stalePoolIDs() = %v, want empty", got)
		}
	})

	t.Run("no current pools", func(t *testing.T) {
		got := stalePoolIDs(nil, desired, nil)
		if len(got) != 0 {
			t.Fatalf("stalePoolIDs() = %v, want empty", got)
		}
	})
}
