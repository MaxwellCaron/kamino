package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TestRunCloneWithOperationSlotAdmissionFailureSkipsClone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/inventory/items/clone", nil)

	var called bool
	acquire := func(ctx context.Context) (func(), error) {
		return nil, context.Canceled
	}

	ok := runCloneWithOperationSlot(c, acquire, func() bool {
		called = true
		return true
	})
	if ok {
		t.Fatal("expected false return on admission failure")
	}
	if called {
		t.Fatal("clone callback should not run when admission fails")
	}
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["error"] != "VM operations are busy" {
		t.Fatalf("error = %q, want sanitized busy message", body["error"])
	}
}

func intPtr(v int) *int { return &v }

func TestBuildScopedCloneNetworkRewrites_MultiNIC(t *testing.T) {
	t.Parallel()

	scope := VMNetworkScope{
		VNet:         "pod",
		AllowedVNets: []string{"pod", "dmz"},
		VLANTag:      199,
	}
	source := []proxmox.VMHardwareNetwork{
		{Device: "net0", Bridge: "vmbr0", Model: "virtio", Firewall: true},
		{Device: "net1", Bridge: "dmz", Model: "virtio", LinkDown: true},
	}

	rewrites := buildScopedCloneNetworkRewrites(scope, source)
	if len(rewrites) != 2 {
		t.Fatalf("len(rewrites) = %d, want 2", len(rewrites))
	}

	byDevice := make(map[string]scopedCloneNetworkRewrite, len(rewrites))
	for _, rewrite := range rewrites {
		byDevice[rewrite.Device] = rewrite
	}

	// net0's unrelated source bridge must fall back to the scope default.
	net0 := byDevice["net0"]
	if net0.Bridge != "pod" || net0.VLANTag != 199 || !net0.Firewall || net0.LinkDown {
		t.Fatalf("net0 rewrite = %#v, want bridge=pod vlan=199 firewall=true linkdown=false", net0)
	}

	// net1's source bridge is an allowed DMZ VNet; it must be preserved.
	net1 := byDevice["net1"]
	if net1.Bridge != "dmz" || net1.VLANTag != 199 || net1.Firewall || !net1.LinkDown {
		t.Fatalf("net1 rewrite = %#v, want bridge=dmz vlan=199 firewall=false linkdown=true", net1)
	}
}

func TestVerifyScopedCloneNetworks(t *testing.T) {
	t.Parallel()

	rewrites := []scopedCloneNetworkRewrite{
		{Device: "net0", Bridge: "pod", VLANTag: 199},
		{Device: "net1", Bridge: "dmz", VLANTag: 199},
	}

	tests := []struct {
		name    string
		cloned  []proxmox.VMHardwareNetwork
		wantErr bool
	}{
		{
			name: "matches exactly",
			cloned: []proxmox.VMHardwareNetwork{
				{Device: "net0", Bridge: "pod", VLANTag: intPtr(199)},
				{Device: "net1", Bridge: "dmz", VLANTag: intPtr(199)},
			},
			wantErr: false,
		},
		{
			name: "missing device",
			cloned: []proxmox.VMHardwareNetwork{
				{Device: "net0", Bridge: "pod", VLANTag: intPtr(199)},
			},
			wantErr: true,
		},
		{
			name: "unexpected extra device",
			cloned: []proxmox.VMHardwareNetwork{
				{Device: "net0", Bridge: "pod", VLANTag: intPtr(199)},
				{Device: "net1", Bridge: "dmz", VLANTag: intPtr(199)},
				{Device: "net2", Bridge: "vmbr0", VLANTag: nil},
			},
			wantErr: true,
		},
		{
			name: "wrong bridge",
			cloned: []proxmox.VMHardwareNetwork{
				{Device: "net0", Bridge: "vmbr0", VLANTag: intPtr(199)},
				{Device: "net1", Bridge: "dmz", VLANTag: intPtr(199)},
			},
			wantErr: true,
		},
		{
			name: "wrong tag",
			cloned: []proxmox.VMHardwareNetwork{
				{Device: "net0", Bridge: "pod", VLANTag: intPtr(4000)},
				{Device: "net1", Bridge: "dmz", VLANTag: intPtr(199)},
			},
			wantErr: true,
		},
		{
			name: "missing tag",
			cloned: []proxmox.VMHardwareNetwork{
				{Device: "net0", Bridge: "pod", VLANTag: nil},
				{Device: "net1", Bridge: "dmz", VLANTag: intPtr(199)},
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := verifyScopedCloneNetworks(rewrites, tc.cloned)
			if (err != nil) != tc.wantErr {
				t.Fatalf("verifyScopedCloneNetworks() error = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

// TestVMCloneCloneVM_ScopedRejectsZeroNICSourceForManagerPersonalPod proves clone scope is not skipped for managers.
func TestVMCloneCloneVM_ScopedRejectsZeroNICSourceForManagerPersonalPod(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	itemID := uuid.New()
	targetFolderID := uuid.New()
	upstreamUUID := uuid.New()

	authz := &fakeVMAuthz{
		isManager: true,
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            "node-a",
			Vmid:            101,
			GuestType:       string(proxmox.GuestQEMU),
			UpstreamUUID:    upstreamUUID,
		},
	}
	px := &fakeVMProxmox{
		identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID},
		hardwareConfigFn: func(context.Context, string, int) (*proxmox.VMHardwareConfig, error) {
			return &proxmox.VMHardwareConfig{Networks: []proxmox.VMHardwareNetwork{}}, nil
		},
	}
	reader := &fakePodNetworkScopeReader{row: database.GetPodNetworkScopeForInventoryItemRow{
		Kind:          database.PodNetworkAllocationKindPersonalPod,
		FolderID:      targetFolderID,
		NetworkNumber: 42,
	}}
	h := &VMHandler{
		Authz:              authz,
		PX:                 px,
		NetworkScopeReader: reader,
		NetworkCatalog:     testNetworkCatalog(t),
	}

	r := mountVMItemRoute(http.MethodPost, "/inventory/items/:id/vm/clone", principalID, h.CloneVM)
	body := `{"name":"clone-vm","target_folder_id":"` + targetFolderID.String() + `"}`
	w := doJSONRequest(r, http.MethodPost, "/inventory/items/"+itemID.String()+"/vm/clone", body)

	assertStatus(t, w, http.StatusUnprocessableEntity)
	assertBodyContains(t, w, "at least one network interface")
}

// TestVMCloneCloneVM_ScopedRejectsZeroNICSourceDevPod proves the zero-NIC guard now applies to dev pods too.
func TestVMCloneCloneVM_ScopedRejectsZeroNICSourceDevPod(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	itemID := uuid.New()
	targetFolderID := uuid.New()
	upstreamUUID := uuid.New()
	profileKey := podnetwork.ProfileLANDMZRouterV1

	authz := &fakeVMAuthz{
		isManager: false,
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            "node-a",
			Vmid:            101,
			GuestType:       string(proxmox.GuestQEMU),
			UpstreamUUID:    upstreamUUID,
		},
	}
	px := &fakeVMProxmox{
		identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID},
		hardwareConfigFn: func(context.Context, string, int) (*proxmox.VMHardwareConfig, error) {
			return &proxmox.VMHardwareConfig{Networks: []proxmox.VMHardwareNetwork{}}, nil
		},
	}
	reader := &fakePodNetworkScopeReader{row: database.GetPodNetworkScopeForInventoryItemRow{
		Kind:              database.PodNetworkAllocationKindDevPod,
		FolderID:          targetFolderID,
		NetworkNumber:     17,
		NetworkProfileKey: &profileKey,
	}}
	h := &VMHandler{
		Authz:              authz,
		PX:                 px,
		NetworkScopeReader: reader,
		NetworkCatalog:     testNetworkCatalog(t),
	}

	r := mountVMItemRoute(http.MethodPost, "/inventory/items/:id/vm/clone", principalID, h.CloneVM)
	body := `{"name":"clone-vm","target_folder_id":"` + targetFolderID.String() + `"}`
	w := doJSONRequest(r, http.MethodPost, "/inventory/items/"+itemID.String()+"/vm/clone", body)

	assertStatus(t, w, http.StatusUnprocessableEntity)
	assertBodyContains(t, w, "at least one network interface")
}

func TestRunCloneWithOperationSlotReleasesAfterCallbackFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/inventory/items/clone", nil)

	executor := vmactions.NewExecutor(
		nil,
		nil,
		nil,
		vmactions.OperationConfig{Concurrency: 1},
		vmactions.PowerConfig{Concurrency: 1, TaskTimeout: time.Minute},
	)

	ok := runCloneWithOperationSlot(c, executor.AcquireOperationSlot, func() bool {
		return false
	})
	if ok {
		t.Fatal("expected false callback result")
	}

	acquireCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	release, err := executor.AcquireOperationSlot(acquireCtx)
	if err != nil {
		t.Fatalf("slot was not released after callback failure: %v", err)
	}
	release()
}
