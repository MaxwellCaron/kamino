package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestGetOverview_QEMUIncludesDashboardData(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()
	upstreamUUID := uuid.New()
	const vmid = 303

	authz := &fakeVMAuthz{vmRecord: authorization.VMRecord{
		InventoryItemID: itemID,
		Node:            "node-a",
		Vmid:            vmid,
		GuestType:       string(proxmox.GuestQEMU),
		UpstreamUUID:    upstreamUUID,
	}}
	px := &fakeVMProxmox{
		identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID},
		hardwareConfigFn: func(ctx context.Context, node string, gotVMID int) (*proxmox.VMHardwareConfig, error) {
			if node != "node-a" || gotVMID != vmid {
				t.Fatalf("GetVMHardwareConfig(%q, %d), want node-a, %d", node, gotVMID, vmid)
			}
			return &proxmox.VMHardwareConfig{
				Display: "qxl",
				Networks: []proxmox.VMHardwareNetwork{
					{Device: "net0", Bridge: "vmbr0", Model: "virtio"},
				},
			}, nil
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{"data": []proxmox.VM{{
			VMID:   vmid,
			Node:   "node1",
			Status: "running",
			CPU:    0.25,
			MaxCPU: 4,
			Mem:    1024,
			MaxMem: 4096,
		}}}); err != nil {
			t.Errorf("encode notifier response: %v", err)
		}
	}))
	defer server.Close()

	notifier := vmstatus.NewNotifier(proxmox.NewHTTPTestClient(server), nil)
	if err := notifier.RefreshNow(context.Background()); err != nil {
		t.Fatalf("seed notifier resources: %v", err)
	}

	h := newVMTestHandler(authz, px)
	h.Notifier = notifier
	r := mountVMItemRoute(http.MethodGet, "/inventory/items/:id/vm/overview", principalID, h.GetOverview)
	w := doJSONRequest(r, http.MethodGet, "/inventory/items/"+itemID.String()+"/vm/overview", "")

	assertStatus(t, w, http.StatusOK)
	var response vmOverviewResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Display != "qxl" {
		t.Fatalf("display = %q, want qxl", response.Display)
	}
	if len(response.Networks) != 1 || response.Networks[0].Device != "net0" || response.Networks[0].Bridge != "vmbr0" {
		t.Fatalf("networks = %#v, want net0 on vmbr0", response.Networks)
	}
	if response.Resources == nil || response.Resources.CPU != 0.25 || response.Resources.MaxCPU != 4 {
		t.Fatalf("resources = %#v, want cached notifier metrics", response.Resources)
	}
}

func TestGetOverview_LXCIncludesNetworksWithoutDisplay(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()
	upstreamUUID := uuid.New()

	authz := &fakeVMAuthz{vmRecord: authorization.VMRecord{
		InventoryItemID: itemID,
		Node:            "node-b",
		Vmid:            404,
		GuestType:       string(proxmox.GuestLXC),
		UpstreamUUID:    upstreamUUID,
	}}
	px := &fakeVMProxmox{
		identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID},
		lxcNetworksConfigFn: func(ctx context.Context, node string, vmid int) ([]proxmox.VMHardwareNetwork, error) {
			return []proxmox.VMHardwareNetwork{{Device: "eth0", Bridge: "vnet10"}}, nil
		},
	}
	h := newVMTestHandler(authz, px)
	r := mountVMItemRoute(http.MethodGet, "/inventory/items/:id/vm/overview", principalID, h.GetOverview)
	w := doJSONRequest(r, http.MethodGet, "/inventory/items/"+itemID.String()+"/vm/overview", "")

	assertStatus(t, w, http.StatusOK)
	var response map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if _, exists := response["display"]; exists {
		t.Fatalf("LXC overview unexpectedly included display: %s", w.Body.String())
	}
	networks, ok := response["networks"].([]any)
	if !ok || len(networks) != 1 {
		t.Fatalf("networks = %#v, want one network", response["networks"])
	}
}

func TestGetOverview_PermissionDenied(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()
	h := newVMTestHandler(&fakeVMAuthz{requireErr: authorization.ErrForbidden}, &fakeVMProxmox{})
	r := mountVMItemRoute(http.MethodGet, "/inventory/items/:id/vm/overview", principalID, h.GetOverview)
	w := doJSONRequest(r, http.MethodGet, "/inventory/items/"+itemID.String()+"/vm/overview", "")

	assertStatus(t, w, http.StatusForbidden)
	assertBodyContains(t, w, "forbidden")
}

func TestUpdateHardware_PermissionDenied(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: authorization.ErrForbidden}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := mountVMItemRoute(http.MethodPut, "/inventory/items/:id/vm/hardware", principalID, h.UpdateHardware)
	w := doJSONRequest(r, http.MethodPut, "/inventory/items/"+itemID.String()+"/vm/hardware", `{"sockets":1,"cores":1,"memory":1}`)

	assertStatus(t, w, http.StatusForbidden)
	assertBodyContains(t, w, "forbidden")
}

// fakeVMActionClaimsDB reproduces the at-most-one-active-claim-per-item invariant without a live database.
type fakeVMActionClaimsDB struct {
	mu     sync.Mutex
	claims map[uuid.UUID]struct{}
}

func newFakeVMActionClaimsDB() *fakeVMActionClaimsDB {
	return &fakeVMActionClaimsDB{claims: make(map[uuid.UUID]struct{})}
}

func (f *fakeVMActionClaimsDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if !strings.Contains(sql, "DELETE FROM vm_action_claims") {
		return pgconn.CommandTag{}, fmt.Errorf("fakeVMActionClaimsDB: unsupported Exec query")
	}
	itemID, _ := args[0].(uuid.UUID)
	f.mu.Lock()
	delete(f.claims, itemID)
	f.mu.Unlock()
	return pgconn.CommandTag{}, nil
}

func (f *fakeVMActionClaimsDB) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) {
	return nil, fmt.Errorf("fakeVMActionClaimsDB: Query not supported")
}

func (f *fakeVMActionClaimsDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	if !strings.Contains(sql, "INSERT INTO vm_action_claims") {
		return fakeVMActionClaimRow{err: fmt.Errorf("fakeVMActionClaimsDB: unsupported QueryRow query")}
	}
	itemID, _ := args[0].(uuid.UUID)
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, exists := f.claims[itemID]; exists {
		return fakeVMActionClaimRow{err: pgx.ErrNoRows}
	}
	f.claims[itemID] = struct{}{}
	return fakeVMActionClaimRow{itemID: itemID}
}

type fakeVMActionClaimRow struct {
	itemID uuid.UUID
	err    error
}

// Scan matches the column order ClaimVMAction selects.
func (r fakeVMActionClaimRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	*(dest[0].(*uuid.UUID)) = r.itemID
	if action, ok := dest[1].(*string); ok {
		*action = "update_hardware"
	}
	if actor, ok := dest[2].(*uuid.UUID); ok {
		*actor = r.itemID
	}
	if claimedAt, ok := dest[3].(*pgtype.Timestamptz); ok {
		claimedAt.Time = time.Now()
		claimedAt.Valid = true
	}
	if detail, ok := dest[4].(**string); ok {
		*detail = nil
	}
	return nil
}

func TestNormalizeScopedHardwareEditNetwork(t *testing.T) {
	t.Parallel()

	scope := VMNetworkScope{
		VNet:         "pod",
		AllowedVNets: []string{"pod", "dmz"},
		VLANTag:      17,
	}
	current := map[string]proxmox.VMHardwareNetwork{
		"net0": {Device: "net0", Bridge: "pod", VLANTag: intPtr(17)},
		"net1": {Device: "net1", Bridge: "vmbr7", VLANTag: nil},       // untagged manager override on an unrelated bridge
		"net2": {Device: "net2", Bridge: "dmz", VLANTag: intPtr(555)}, // manager-set custom tag
	}

	tests := []struct {
		name       string
		requested  updateVMHardwareNetworkRequest
		wantOK     bool
		wantBridge string
		wantTag    *int
	}{
		{
			name:       "existing device tag matches allocation and is preserved despite a different submitted tag",
			requested:  updateVMHardwareNetworkRequest{Device: "net0", Bridge: "pod", VLANTag: 9999},
			wantOK:     true,
			wantBridge: "pod",
			wantTag:    intPtr(17),
		},
		{
			name:       "untagged manager override survives a malicious submitted tag",
			requested:  updateVMHardwareNetworkRequest{Device: "net1", Bridge: "vmbr7", VLANTag: 9999},
			wantOK:     true,
			wantBridge: "vmbr7",
			wantTag:    nil,
		},
		{
			name:       "custom manager-set tag survives a malicious submitted tag",
			requested:  updateVMHardwareNetworkRequest{Device: "net2", Bridge: "dmz", VLANTag: 9999},
			wantOK:     true,
			wantBridge: "dmz",
			wantTag:    intPtr(555),
		},
		{
			name:       "existing unchanged manager-set bridge outside AllowedVNets is preserved",
			requested:  updateVMHardwareNetworkRequest{Device: "net1", Bridge: "vmbr7", VLANTag: 0},
			wantOK:     true,
			wantBridge: "vmbr7",
			wantTag:    nil,
		},
		{
			name:       "existing device may move to an allowed DMZ bridge",
			requested:  updateVMHardwareNetworkRequest{Device: "net0", Bridge: "dmz", VLANTag: 0},
			wantOK:     true,
			wantBridge: "dmz",
			wantTag:    intPtr(17),
		},
		{
			name:      "existing device cannot move to a disallowed, changed bridge",
			requested: updateVMHardwareNetworkRequest{Device: "net0", Bridge: "vmbr0", VLANTag: 0},
			wantOK:    false,
		},
		{
			name:       "new NIC (unknown device) with empty bridge defaults to scope default and gets allocation tag",
			requested:  updateVMHardwareNetworkRequest{Device: "", Bridge: "", VLANTag: 9999},
			wantOK:     true,
			wantBridge: "pod",
			wantTag:    intPtr(17),
		},
		{
			name:       "new NIC with an allowed bridge preserves it and still forces the allocation tag",
			requested:  updateVMHardwareNetworkRequest{Device: "", Bridge: "dmz", VLANTag: 9999},
			wantOK:     true,
			wantBridge: "dmz",
			wantTag:    intPtr(17),
		},
		{
			name:      "new NIC with a disallowed bridge is rejected",
			requested: updateVMHardwareNetworkRequest{Device: "", Bridge: "vmbr0", VLANTag: 0},
			wantOK:    false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			bridge, vlanTag, ok := normalizeScopedHardwareEditNetwork(scope, current, tc.requested)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tc.wantOK)
			}
			if !tc.wantOK {
				return
			}
			if bridge != tc.wantBridge {
				t.Fatalf("bridge = %q, want %q", bridge, tc.wantBridge)
			}
			switch {
			case tc.wantTag == nil && vlanTag != nil:
				t.Fatalf("vlanTag = %d, want nil", *vlanTag)
			case tc.wantTag != nil && (vlanTag == nil || *vlanTag != *tc.wantTag):
				t.Fatalf("vlanTag = %v, want %d", vlanTag, *tc.wantTag)
			}
		})
	}
}

func vmHardwareUpdateRequestBody(networks string) string {
	return `{
		"ostype": "l26",
		"bios": "seabios",
		"machine": "pc",
		"scsi": "virtio-scsi-single",
		"cpu_type": "x86-64-v2-AES",
		"storage": "local-lvm",
		"sockets": 1,
		"cores": 1,
		"memory": 2,
		"balloon": 0,
		"disk_size": 32,
		"networks": ` + networks + `
	}`
}

// TestUpdateHardware_NonManagerScopedPreservesCurrentTagsAndScopesNewNIC proves tampered tags never override server state.
func TestUpdateHardware_NonManagerScopedPreservesCurrentTagsAndScopesNewNIC(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()
	upstreamUUID := uuid.New()
	const node = "node-a"
	const vmid = 555
	profileKey := podnetwork.ProfileLANDMZRouterV1
	sentinelErr := errors.New("sentinel: stop after capturing proxmox config")

	authz := &fakeVMAuthz{
		isManager: false,
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            node,
			Vmid:            vmid,
			GuestType:       string(proxmox.GuestQEMU),
			UpstreamUUID:    upstreamUUID,
		},
	}

	var captured proxmox.VMHardwareConfig
	px := &fakeVMProxmox{
		identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID},
		hardwareConfigFn: func(context.Context, string, int) (*proxmox.VMHardwareConfig, error) {
			return &proxmox.VMHardwareConfig{
				Networks: []proxmox.VMHardwareNetwork{
					{Device: "net0", Bridge: "vmbr7", Model: "virtio", VLANTag: nil},
					{Device: "net1", Bridge: "dmz", Model: "virtio", VLANTag: intPtr(555)},
				},
			}, nil
		},
		updateVMHardwareFn: func(_ context.Context, _ string, _ int, config proxmox.VMHardwareConfig) error {
			captured = config
			return sentinelErr
		},
	}
	reader := &fakePodNetworkScopeReader{row: database.GetPodNetworkScopeForInventoryItemRow{
		Kind:              database.PodNetworkAllocationKindDevPod,
		FolderID:          uuid.New(),
		NetworkNumber:     17,
		NetworkProfileKey: &profileKey,
	}}
	h := &VMHandler{
		Authz:              authz,
		PX:                 px,
		NetworkScopeReader: reader,
		NetworkCatalog:     testNetworkCatalog(t),
		Claims:             vmactions.NewClaims(newFakeVMActionClaimsDB(), nil),
	}

	body := vmHardwareUpdateRequestBody(`[
		{"device":"net0","bridge":"vmbr7","model":"virtio","vlan_tag":4000},
		{"device":"net1","bridge":"dmz","model":"virtio","vlan_tag":4000},
		{"bridge":"dmz","model":"virtio","vlan_tag":4000}
	]`)

	r := mountVMItemRoute(http.MethodPut, "/inventory/items/:id/vm/hardware", principalID, h.UpdateHardware)
	w := doJSONRequest(r, http.MethodPut, "/inventory/items/"+itemID.String()+"/vm/hardware", body)

	assertStatus(t, w, http.StatusUnprocessableEntity)
	assertBodyContains(t, w, sentinelErr.Error())

	if len(captured.Networks) != 3 {
		t.Fatalf("captured %d networks, want 3: %#v", len(captured.Networks), captured.Networks)
	}
	byDevice := make(map[string]proxmox.VMHardwareNetwork, len(captured.Networks))
	for _, network := range captured.Networks {
		byDevice[network.Device] = network
	}

	net0 := byDevice["net0"]
	if net0.Bridge != "vmbr7" || net0.VLANTag != nil {
		t.Fatalf("net0 = %#v, want bridge=vmbr7 vlan=nil (manager override preserved)", net0)
	}
	net1 := byDevice["net1"]
	if net1.Bridge != "dmz" || net1.VLANTag == nil || *net1.VLANTag != 555 {
		t.Fatalf("net1 = %#v, want bridge=dmz vlan=555 (manager override preserved)", net1)
	}
	// The new NIC has no device name yet; it is the one entry that isn't net0/net1.
	var newNIC *proxmox.VMHardwareNetwork
	for _, network := range captured.Networks {
		if network.Device != "net0" && network.Device != "net1" {
			newNIC = &network
			break
		}
	}
	if newNIC == nil {
		t.Fatal("new NIC missing from captured networks")
	}
	if newNIC.Bridge != "dmz" || newNIC.VLANTag == nil || *newNIC.VLANTag != 17 {
		t.Fatalf("new NIC = %#v, want bridge=dmz vlan=17 (allocation tag forced)", *newNIC)
	}
}

// TestUpdateHardware_NonManagerScopedRejectsDisallowedBridgeChange proves a non-manager can't move to an unrelated bridge.
func TestUpdateHardware_NonManagerScopedRejectsDisallowedBridgeChange(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()
	upstreamUUID := uuid.New()
	const node = "node-a"
	const vmid = 555
	profileKey := podnetwork.ProfileLANDMZRouterV1

	authz := &fakeVMAuthz{
		isManager: false,
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            node,
			Vmid:            vmid,
			GuestType:       string(proxmox.GuestQEMU),
			UpstreamUUID:    upstreamUUID,
		},
	}
	updateCalled := false
	px := &fakeVMProxmox{
		identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID},
		hardwareConfigFn: func(context.Context, string, int) (*proxmox.VMHardwareConfig, error) {
			return &proxmox.VMHardwareConfig{
				Networks: []proxmox.VMHardwareNetwork{
					{Device: "net0", Bridge: "pod", Model: "virtio", VLANTag: intPtr(17)},
				},
			}, nil
		},
		updateVMHardwareFn: func(context.Context, string, int, proxmox.VMHardwareConfig) error {
			updateCalled = true
			return nil
		},
	}
	reader := &fakePodNetworkScopeReader{row: database.GetPodNetworkScopeForInventoryItemRow{
		Kind:              database.PodNetworkAllocationKindDevPod,
		FolderID:          uuid.New(),
		NetworkNumber:     17,
		NetworkProfileKey: &profileKey,
	}}
	h := &VMHandler{
		Authz:              authz,
		PX:                 px,
		NetworkScopeReader: reader,
		NetworkCatalog:     testNetworkCatalog(t),
		Claims:             vmactions.NewClaims(newFakeVMActionClaimsDB(), nil),
	}

	body := vmHardwareUpdateRequestBody(`[
		{"device":"net0","bridge":"vmbr0","model":"virtio","vlan_tag":17}
	]`)

	r := mountVMItemRoute(http.MethodPut, "/inventory/items/:id/vm/hardware", principalID, h.UpdateHardware)
	w := doJSONRequest(r, http.MethodPut, "/inventory/items/"+itemID.String()+"/vm/hardware", body)

	assertStatus(t, w, http.StatusUnprocessableEntity)
	assertBodyContains(t, w, "not permitted inside this pod")
	if updateCalled {
		t.Fatal("Proxmox UpdateVMHardware was called for a disallowed bridge change")
	}
}

// TestUpdateHardware_ManagerOverridePassesThroughUnrestricted proves a manager's override reaches Proxmox as submitted.
func TestUpdateHardware_ManagerOverridePassesThroughUnrestricted(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()
	upstreamUUID := uuid.New()
	const node = "node-a"
	const vmid = 555
	profileKey := podnetwork.ProfileLANDMZRouterV1
	sentinelErr := errors.New("sentinel: stop after capturing proxmox config")

	authz := &fakeVMAuthz{
		isManager: true,
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            node,
			Vmid:            vmid,
			GuestType:       string(proxmox.GuestQEMU),
			UpstreamUUID:    upstreamUUID,
		},
	}
	var captured proxmox.VMHardwareConfig
	px := &fakeVMProxmox{
		identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID},
		updateVMHardwareFn: func(_ context.Context, _ string, _ int, config proxmox.VMHardwareConfig) error {
			captured = config
			return sentinelErr
		},
	}
	reader := &fakePodNetworkScopeReader{row: database.GetPodNetworkScopeForInventoryItemRow{
		Kind:              database.PodNetworkAllocationKindDevPod,
		FolderID:          uuid.New(),
		NetworkNumber:     17,
		NetworkProfileKey: &profileKey,
	}}
	h := &VMHandler{
		Authz:              authz,
		PX:                 px,
		NetworkScopeReader: reader,
		NetworkCatalog:     testNetworkCatalog(t),
		Claims:             vmactions.NewClaims(newFakeVMActionClaimsDB(), nil),
	}

	body := vmHardwareUpdateRequestBody(`[
		{"device":"net0","bridge":"vmbr0","model":"virtio","vlan_tag":4000}
	]`)

	r := mountVMItemRoute(http.MethodPut, "/inventory/items/:id/vm/hardware", principalID, h.UpdateHardware)
	w := doJSONRequest(r, http.MethodPut, "/inventory/items/"+itemID.String()+"/vm/hardware", body)

	assertStatus(t, w, http.StatusUnprocessableEntity)
	assertBodyContains(t, w, sentinelErr.Error())

	if len(captured.Networks) != 1 {
		t.Fatalf("captured %d networks, want 1: %#v", len(captured.Networks), captured.Networks)
	}
	got := captured.Networks[0]
	if got.Bridge != "vmbr0" || got.VLANTag == nil || *got.VLANTag != 4000 {
		t.Fatalf("manager override = %#v, want the caller's requested bridge/tag to pass through unchanged", got)
	}
}
