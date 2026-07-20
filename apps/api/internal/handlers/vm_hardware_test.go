package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/google/uuid"
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

	notifier := vmstatus.NewNotifier(proxmox.NewHTTPTestClient(server))
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
