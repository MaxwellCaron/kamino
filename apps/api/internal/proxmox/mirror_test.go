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
