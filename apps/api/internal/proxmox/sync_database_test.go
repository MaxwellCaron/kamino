package proxmox

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// KAMINO_SYNC_TEST_DATABASE_URL must point to a disposable database with schema.sql applied.
func TestInventoryImportDatabase(t *testing.T) {
	url := os.Getenv("KAMINO_SYNC_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set KAMINO_SYNC_TEST_DATABASE_URL to an isolated test database")
	}
	ctx := context.Background()
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.MaxConns = 1 // Exercise transaction-local quota bypass on a reused connection.
	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	q := database.New(db)
	root, err := q.CreateRootFolder(ctx, "Sync_test_"+strings.ReplaceAll(uuid.NewString(), "-", ""))
	if err != nil {
		t.Fatal(err)
	}
	defer q.DeleteInventoryItem(ctx, root)
	if err := q.UpdateInventoryFolderVMLimit(ctx, database.UpdateInventoryFolderVMLimitParams{ID: root, VmLimit: new(int32(1))}); err != nil {
		t.Fatal(err)
	}
	importer := NewInventoryImporter(db, nil)
	sharedUUID := uuid.New()
	template := &VMConfigSummary{Name: "template", UpstreamUUID: sharedUUID, IsTemplate: true, DiskGB: new(float64(8))}
	clone := &VMConfigSummary{Name: "clone", UpstreamUUID: sharedUUID, DiskGB: new(float64(8))}
	persist := func(node string, id int, s *VMConfigSummary) {
		t.Helper()
		if err := importer.persistVMConfigSummary(ctx, root, node, id, GuestQEMU, s, true); err != nil {
			t.Fatal(err)
		}
	}
	get := func(id int) database.GetProxmoxVMByIdentityRow {
		t.Helper()
		r, err := q.GetProxmoxVMByIdentity(ctx, database.GetProxmoxVMByIdentityParams{UpstreamUuid: sharedUUID, Vmid: int32(id)})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	persist("node1", 800001, template)
	original := get(800001)
	var aclID uuid.UUID
	err = db.QueryRow(ctx, `INSERT INTO inventory_acl_entries (inventory_item_id,principal_id,effect,permissions) SELECT $1,id,'allow',1 FROM principals WHERE provider_id IN (SELECT id FROM principal_providers WHERE provider_type='system') LIMIT 1 RETURNING id`, original.InventoryItemID).Scan(&aclID)
	if err != nil {
		t.Fatal(err)
	}
	persist("node1", 800002, clone)
	cloneID := get(800002).InventoryItemID
	if cloneID == original.InventoryItemID {
		t.Fatal("template and clone share an inventory item")
	}
	for range 3 {
		persist("node1", 800001, template)
		persist("node1", 800002, clone)
	}
	if get(800001).InventoryItemID != original.InventoryItemID || get(800002).InventoryItemID != cloneID {
		t.Fatal("repeated sync changed inventory IDs")
	}
	var isTemplate bool
	if err := db.QueryRow(ctx, "SELECT is_template FROM proxmox_vms WHERE inventory_item_id=$1", original.InventoryItemID).Scan(&isTemplate); err != nil || !isTemplate {
		t.Fatalf("template flag changed: %v", err)
	}
	// A node migration updates the locator while preserving references and unknown disk metadata.
	template.Name = "renamed"
	template.DiskGB = nil
	persist("node2", 800001, template)
	migrated := get(800001)
	if migrated.InventoryItemID != original.InventoryItemID || migrated.Node != "node2" || migrated.Name != "renamed" || migrated.DiskGb == nil || *migrated.DiskGb != 8 {
		t.Fatalf("migration lost metadata: %+v", migrated)
	}
	var aclItem uuid.UUID
	if err := db.QueryRow(ctx, "SELECT inventory_item_id FROM inventory_acl_entries WHERE id=$1", aclID).Scan(&aclItem); err != nil || aclItem != original.InventoryItemID {
		t.Fatalf("ACL reference lost: %v", err)
	}
	// Reused locators must never delete old inventory or transfer its ACLs.
	replacement := *template
	replacement.UpstreamUUID = uuid.New()
	if err := importer.persistVMConfigSummary(ctx, root, "node2", 800001, GuestQEMU, &replacement, true); err == nil || !strings.Contains(err.Error(), "preserved") {
		t.Fatalf("expected identity conflict, got %v", err)
	}
	if get(800001).InventoryItemID != original.InventoryItemID {
		t.Fatal("conflict replaced existing item")
	}
	// Failed or committed import transactions must not disable normal provisioning quotas.
	_, err = q.CreateVMItem(ctx, database.CreateVMItemParams{ParentID: &root, Name: "over-quota"})
	if err == nil || !strings.Contains(err.Error(), "Folder limit exceeded") {
		t.Fatalf("ordinary quota bypassed: %v", err)
	}
	if err := importer.persistVMConfigSummary(ctx, root, "node1", 800003, GuestQEMU, clone, false); err == nil {
		t.Fatal("provisioning bypassed quota")
	}
	// A failed import must suppress selected removals and leave existing data intact.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "node offline", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	importer.client = NewHTTPTestClient(server)
	results := importer.applySyncDiff(ctx, SyncDiff{
		Adds:    []SyncChange{{ID: "node1/800004", Kind: SyncChangeAdd, Node: "node1", VMID: 800004, GuestType: "qemu", Actionable: true}},
		Removes: []SyncChange{{ID: "node1/800002", Kind: SyncChangeRemove, ItemID: cloneID, Actionable: true}},
	}, SyncSelection{AddIDs: []string{"node1/800004"}, RemoveIDs: []string{"node1/800002"}})
	if len(results) != 2 || results[0].Status != "error" || results[1].Status != "skipped" {
		t.Fatalf("unexpected results: %+v", results)
	}
	if get(800002).InventoryItemID != cloneID {
		t.Fatal("failed import removed existing item")
	}
	// A stale removal from the pre-migration diff must not delete the moved item.
	stale := importer.applyRemove(ctx, q, SyncChange{ID: "node1/800001", Node: "node1", VMID: 800001, ItemID: original.InventoryItemID})
	if stale.Status != "skipped" {
		t.Fatalf("stale migration removal: %+v", stale)
	}
	// An unavailable node is not evidence that an existing VM was deleted.
	offline := importer.applyRemove(ctx, q, SyncChange{ID: "node1/800002", Node: "node1", VMID: 800002, ItemID: cloneID})
	if offline.Status != "skipped" {
		t.Fatalf("offline removal: %+v", offline)
	}
	if get(800002).InventoryItemID != cloneID {
		t.Fatal("offline node removed existing inventory")
	}

	// Diskless guests can be imported through the read-only HTTP path.
	disklessServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("unexpected Proxmox write: %s", r.Method)
		}
		writeAPIResponse(t, w, http.StatusOK, map[string]any{"smbios1": "uuid=" + sharedUUID.String()})
	}))
	defer disklessServer.Close()
	importer.client = NewHTTPTestClient(disklessServer)
	if err := importer.importVM(ctx, root, "node1", 800005, GuestQEMU); err != nil {
		t.Fatal(err)
	}
	diskless := get(800005)
	if diskless.DiskGb == nil || *diskless.DiskGb != 0 {
		t.Fatalf("diskless guest was not imported: %+v", diskless)
	}

	rows, err := q.GetAllInventoryItems(ctx)
	if err != nil {
		t.Fatal(err)
	}
	diff, err := computeSyncDiff([]VM{
		{Node: "node2", VMID: 800001, Name: "renamed", Type: "qemu", Template: 1},
		{Node: "node1", VMID: 800002, Name: "clone", Type: "qemu"},
		{Node: "node1", VMID: 800005, Name: "VM 800005", Type: "qemu"},
	}, rows, func(uuid.UUID) ([]string, error) { return nil, nil })
	if err != nil || len(diff.Adds)+len(diff.Updates)+len(diff.Removes) != 0 {
		t.Fatalf("sync did not converge: %+v, %v", diff, err)
	}
	absentServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "not found", http.StatusNotFound) }))
	defer absentServer.Close()
	importer.client = NewHTTPTestClient(absentServer)
	removed := importer.applyRemove(ctx, q, SyncChange{ID: "node1/800005", Node: "node1", VMID: 800005, ItemID: diskless.InventoryItemID})
	if removed.Status != "success" {
		t.Fatalf("confirmed absence was not reconciled: %+v", removed)
	}

}
