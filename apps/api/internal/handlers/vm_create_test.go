package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type fakePodNetworkScopeReader struct {
	row database.GetPodNetworkScopeForInventoryItemRow
}

func (f *fakePodNetworkScopeReader) GetPodNetworkScopeForInventoryItem(
	context.Context,
	uuid.UUID,
) (database.GetPodNetworkScopeForInventoryItemRow, error) {
	return f.row, nil
}

func strPtr(value string) *string {
	return &value
}

func testNetworkCatalog(t *testing.T) *podnetwork.Catalog {
	t.Helper()

	catalog, err := podnetwork.NewCatalog(podnetwork.Config{
		LANVNet:   "pod",
		DMZVNet:   "dmz",
		WANIPBase: "172.16.",
	})
	if err != nil {
		t.Fatalf("NewCatalog() error = %v", err)
	}
	return catalog
}

type fakeVMCreateAuthz struct {
	fakeVMAuthz
	hasAny         bool
	hasAnyErr      error
	requireMgmtErr error
}

func (f *fakeVMCreateAuthz) HasAny(_ context.Context, _ uuid.UUID, _ authorization.Mask) (bool, error) {
	return f.hasAny, f.hasAnyErr
}

func (f *fakeVMCreateAuthz) RequireManagement(_ context.Context, _ uuid.UUID, _ authorization.ManagementPermission) error {
	return f.requireMgmtErr
}

var _ vmCreateAuthz = (*fakeVMCreateAuthz)(nil)

type fakeVMCreateProxmox struct {
	nodes      []proxmox.Node
	nodesErr   error
	nodesCalls atomic.Int32

	getCreateStorages func(ctx context.Context, node string) ([]proxmox.Storage, []proxmox.Storage, error)
	getCreateNetworks func(ctx context.Context, node string) ([]proxmox.NetworkBridge, []proxmox.VNet, error)
	createVM          func(ctx context.Context, node string, params map[string]string) error
	getBridgesFn      func(ctx context.Context, node string) ([]proxmox.NetworkBridge, error)
	getVNetsFn        func(ctx context.Context) ([]proxmox.VNet, error)
}

func (f *fakeVMCreateProxmox) GetNodes(_ context.Context) ([]proxmox.Node, error) {
	f.nodesCalls.Add(1)
	return f.nodes, f.nodesErr
}

func (f *fakeVMCreateProxmox) ResolvePrimaryNode(_ context.Context) (proxmox.Node, error) {
	panic("fakeVMCreateProxmox: ResolvePrimaryNode not configured for this test")
}

func (f *fakeVMCreateProxmox) GetCreateStorages(ctx context.Context, node string) ([]proxmox.Storage, []proxmox.Storage, error) {
	if f.getCreateStorages == nil {
		panic("fakeVMCreateProxmox: GetCreateStorages not configured for this test")
	}
	return f.getCreateStorages(ctx, node)
}

func (f *fakeVMCreateProxmox) GetCreateNetworks(ctx context.Context, node string) ([]proxmox.NetworkBridge, []proxmox.VNet, error) {
	if f.getCreateNetworks == nil {
		panic("fakeVMCreateProxmox: GetCreateNetworks not configured for this test")
	}
	return f.getCreateNetworks(ctx, node)
}

func (f *fakeVMCreateProxmox) GetStorages(_ context.Context, _ string) ([]proxmox.Storage, error) {
	panic("fakeVMCreateProxmox: GetStorages not configured for this test")
}

func (f *fakeVMCreateProxmox) IsSharedStorage(_ proxmox.Storage) bool {
	panic("fakeVMCreateProxmox: IsSharedStorage not configured for this test")
}

func (f *fakeVMCreateProxmox) IsExcludedStorage(_ proxmox.Storage) bool {
	panic("fakeVMCreateProxmox: IsExcludedStorage not configured for this test")
}

func (f *fakeVMCreateProxmox) GetISOs(_ context.Context, _, _ string) ([]proxmox.ISOContent, error) {
	panic("fakeVMCreateProxmox: GetISOs not configured for this test")
}

func (f *fakeVMCreateProxmox) GetCreateISOs(_ context.Context, _, _ string) ([]proxmox.ISOContent, error) {
	panic("fakeVMCreateProxmox: GetCreateISOs not configured for this test")
}

func (f *fakeVMCreateProxmox) GetNextVMID(_ context.Context) (int, error) {
	panic("fakeVMCreateProxmox: GetNextVMID not configured for this test")
}

func (f *fakeVMCreateProxmox) IsVMIDAvailable(_ context.Context, _ int) (bool, error) {
	panic("fakeVMCreateProxmox: IsVMIDAvailable not configured for this test")
}

func (f *fakeVMCreateProxmox) GetBridges(ctx context.Context, node string) ([]proxmox.NetworkBridge, error) {
	if f.getBridgesFn == nil {
		panic("fakeVMCreateProxmox: GetBridges not configured for this test")
	}
	return f.getBridgesFn(ctx, node)
}

func (f *fakeVMCreateProxmox) GetVNets(ctx context.Context) ([]proxmox.VNet, error) {
	if f.getVNetsFn == nil {
		panic("fakeVMCreateProxmox: GetVNets not configured for this test")
	}
	return f.getVNetsFn(ctx)
}

func (f *fakeVMCreateProxmox) GetOptimalNode(_ context.Context) (proxmox.Node, error) {
	panic("fakeVMCreateProxmox: GetOptimalNode not configured for this test")
}

func (f *fakeVMCreateProxmox) CreateVM(ctx context.Context, node string, params map[string]string) error {
	if f.createVM == nil {
		panic("fakeVMCreateProxmox: CreateVM not configured for this test")
	}
	return f.createVM(ctx, node, params)
}

func (f *fakeVMCreateProxmox) SyncVMPoolMembership(_ context.Context, _ string, _ int, _ string, _ []string) error {
	panic("fakeVMCreateProxmox: SyncVMPoolMembership not configured for this test")
}

func (f *fakeVMCreateProxmox) DeleteVM(_ context.Context, _ proxmox.GuestType, _ string, _ int) error {
	panic("fakeVMCreateProxmox: DeleteVM not configured for this test")
}

func (f *fakeVMCreateProxmox) GetClusterUsageHistory(_ context.Context, _ string) (proxmox.ClusterUsageHistory, error) {
	panic("fakeVMCreateProxmox: GetClusterUsageHistory not configured for this test")
}

var _ vmCreateProxmox = (*fakeVMCreateProxmox)(nil)

func newVMCreateTestHandler(authz vmCreateAuthz, px vmCreateProxmox) *VMCreateHandler {
	return &VMCreateHandler{
		Authz: authz,
		PX:    px,
	}
}

func newVMCreateTestEngineNoPrincipal(method, path string, handler gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Handle(method, path, handler)
	return r
}

func TestVMCreateGetNodes_NoPrincipal(t *testing.T) {
	t.Parallel()

	h := newVMCreateTestHandler(&fakeVMCreateAuthz{}, &fakeVMCreateProxmox{})
	r := newVMCreateTestEngineNoPrincipal(http.MethodGet, "/proxmox/nodes", h.GetNodes)
	w := doJSONRequest(r, http.MethodGet, "/proxmox/nodes", "")

	assertStatus(t, w, http.StatusUnauthorized)
	assertBodyContains(t, w, "authentication required")
}

func TestVMCreateGetNodes_PermissionDenied(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	authz := &fakeVMCreateAuthz{
		fakeVMAuthz: fakeVMAuthz{isManager: false},
	}
	h := newVMCreateTestHandler(authz, &fakeVMCreateProxmox{})

	r := newVMTestEngine(http.MethodGet, "/proxmox/nodes", principalID, h.GetNodes)
	w := doJSONRequest(r, http.MethodGet, "/proxmox/nodes", "")

	assertStatus(t, w, http.StatusForbidden)
	assertBodyContains(t, w, "forbidden")
}

func TestVMCreateGetNodes_HappyPath(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	wantNodes := []proxmox.Node{{Node: "pve1", Status: "online"}}
	authz := &fakeVMCreateAuthz{hasAny: true}
	h := newVMCreateTestHandler(authz, &fakeVMCreateProxmox{nodes: wantNodes})

	r := newVMTestEngine(http.MethodGet, "/proxmox/nodes", principalID, h.GetNodes)
	w := doJSONRequest(r, http.MethodGet, "/proxmox/nodes", "")

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, `"node":"pve1"`)
}

func TestVMCreateCreateVM_NoPrincipal(t *testing.T) {
	t.Parallel()

	h := newVMCreateTestHandler(&fakeVMCreateAuthz{}, &fakeVMCreateProxmox{})
	r := newVMCreateTestEngineNoPrincipal(http.MethodPost, "/vms", h.CreateVM)
	w := doJSONRequest(r, http.MethodPost, "/vms", `{"target_folder_id":"`+uuid.New().String()+`","name":"test-vm"}`)

	assertStatus(t, w, http.StatusUnauthorized)
	assertBodyContains(t, w, "authentication required")
}

func TestVMCreateCreateVM_PermissionDenied(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	folderID := uuid.New()
	authz := &fakeVMCreateAuthz{
		fakeVMAuthz: fakeVMAuthz{requireErr: authorization.ErrForbidden},
	}
	h := newVMCreateTestHandler(authz, &fakeVMCreateProxmox{})

	r := newVMTestEngine(http.MethodPost, "/vms", principalID, h.CreateVM)
	body := `{"target_folder_id":"` + folderID.String() + `","name":"test-vm"}`
	w := doJSONRequest(r, http.MethodPost, "/vms", body)

	assertStatus(t, w, http.StatusForbidden)
	assertBodyContains(t, w, "forbidden")
}

func TestVMCreateCreateVM_InvalidRequestBody(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	h := newVMCreateTestHandler(&fakeVMCreateAuthz{}, &fakeVMCreateProxmox{})
	r := newVMTestEngine(http.MethodPost, "/vms", principalID, h.CreateVM)

	tests := []struct {
		name string
		body string
	}{
		{name: "malformed json", body: `{not-json`},
		{name: "missing required fields", body: `{}`},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			w := doJSONRequest(r, http.MethodPost, "/vms", tc.body)
			assertStatus(t, w, http.StatusBadRequest)
			assertBodyContains(t, w, "invalid request body")
		})
	}
}

func TestVMCreateCreateVM_InvalidTargetFolderID(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	h := newVMCreateTestHandler(&fakeVMCreateAuthz{}, &fakeVMCreateProxmox{})

	r := newVMTestEngine(http.MethodPost, "/vms", principalID, h.CreateVM)
	w := doJSONRequest(r, http.MethodPost, "/vms", `{"target_folder_id":"not-a-uuid","name":"test-vm"}`)

	assertStatus(t, w, http.StatusBadRequest)
	assertBodyContains(t, w, "invalid target_folder_id")
}

func TestBuildCreateNetworkParams_NormalizedTamperedTagNeverReachesProxmox(t *testing.T) {
	t.Parallel()

	scope := VMNetworkScope{
		VNet:         "pod",
		AllowedVNets: []string{"pod", "dmz"},
		VLANTag:      199,
	}

	// The client claims a bridge/tag pair that does not belong to it.
	tampered := []networkInterface{
		{Bridge: "dmz", Model: "virtio", VLANTag: 4000, Firewall: true},
	}
	for i, iface := range tampered {
		bridge, vlanTag, ok := normalizeScopedCreationNetwork(scope, iface.Bridge)
		if !ok {
			t.Fatalf("normalizeScopedCreationNetwork() ok = false, want true for allowed bridge %q", iface.Bridge)
		}
		tampered[i].Bridge = bridge
		tampered[i].VLANTag = vlanTag
	}

	params := buildCreateNetworkParams(tampered)
	got, ok := params["net0"]
	if !ok {
		t.Fatal("net0 missing from Proxmox create params")
	}
	if strings.Contains(got, "tag=4000") {
		t.Fatalf("net0 = %q, tampered client tag 4000 leaked into Proxmox params", got)
	}
	if !strings.Contains(got, "tag=199") {
		t.Fatalf("net0 = %q, want allocation tag 199", got)
	}
	if !strings.Contains(got, "bridge=dmz") {
		t.Fatalf("net0 = %q, want allowed dmz bridge preserved", got)
	}
}

func TestVMCreateCreateVM_ScopedRejectsDisallowedBridgeBeforeAnyProxmoxCall(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	targetFolderID := uuid.New()
	authz := &fakeVMCreateAuthz{hasAny: true, fakeVMAuthz: fakeVMAuthz{isManager: false}}
	reader := &fakePodNetworkScopeReader{row: database.GetPodNetworkScopeForInventoryItemRow{
		Kind:          database.PodNetworkAllocationKindPersonalPod,
		FolderID:      targetFolderID,
		NetworkNumber: 42,
	}}
	proxmoxCalled := false
	px := &fakeVMCreateProxmox{createVM: func(context.Context, string, map[string]string) error {
		proxmoxCalled = true
		return nil
	}}
	h := &VMCreateHandler{
		Authz:              authz,
		PX:                 px,
		NetworkScopeReader: reader,
		NetworkCatalog:     testNetworkCatalog(t),
		PersonalPodVNet:    "personal",
	}

	r := newVMTestEngine(http.MethodPost, "/vms", principalID, h.CreateVM)
	body := `{"target_folder_id":"` + targetFolderID.String() + `","name":"test-vm","networks":[{"bridge":"vmbr0","model":"virtio","vlan_tag":4000}]}`
	w := doJSONRequest(r, http.MethodPost, "/vms", body)

	assertStatus(t, w, http.StatusUnprocessableEntity)
	assertBodyContains(t, w, "not permitted inside this pod")
	if proxmoxCalled {
		t.Fatal("Proxmox CreateVM was called for a disallowed bridge under an active pod scope")
	}
}

func TestVMCreateCreateVM_ScopedRejectsZeroNetworkInterfaces(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	targetFolderID := uuid.New()
	authz := &fakeVMCreateAuthz{hasAny: true, fakeVMAuthz: fakeVMAuthz{isManager: false}}
	reader := &fakePodNetworkScopeReader{row: database.GetPodNetworkScopeForInventoryItemRow{
		Kind:          database.PodNetworkAllocationKindPersonalPod,
		FolderID:      targetFolderID,
		NetworkNumber: 42,
	}}
	proxmoxCalled := false
	px := &fakeVMCreateProxmox{createVM: func(context.Context, string, map[string]string) error {
		proxmoxCalled = true
		return nil
	}}
	h := &VMCreateHandler{
		Authz:              authz,
		PX:                 px,
		NetworkScopeReader: reader,
		NetworkCatalog:     testNetworkCatalog(t),
		PersonalPodVNet:    "personal",
	}

	r := newVMTestEngine(http.MethodPost, "/vms", principalID, h.CreateVM)
	body := `{"target_folder_id":"` + targetFolderID.String() + `","name":"test-vm"}`
	w := doJSONRequest(r, http.MethodPost, "/vms", body)

	assertStatus(t, w, http.StatusUnprocessableEntity)
	assertBodyContains(t, w, "at least one network interface")
	if proxmoxCalled {
		t.Fatal("Proxmox CreateVM was called for a scoped folder with zero network interfaces")
	}
}

func TestVMCreateCreateVM_ScopedAppliesToManagersToo(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	targetFolderID := uuid.New()
	// Unlike the later hardware-edit override path, creation-time scope rejects even a manager's unrelated bridge.
	authz := &fakeVMCreateAuthz{fakeVMAuthz: fakeVMAuthz{isManager: true}}
	reader := &fakePodNetworkScopeReader{row: database.GetPodNetworkScopeForInventoryItemRow{
		Kind:          database.PodNetworkAllocationKindPersonalPod,
		FolderID:      targetFolderID,
		NetworkNumber: 42,
	}}
	proxmoxCalled := false
	px := &fakeVMCreateProxmox{createVM: func(context.Context, string, map[string]string) error {
		proxmoxCalled = true
		return nil
	}}
	h := &VMCreateHandler{
		Authz:              authz,
		PX:                 px,
		NetworkScopeReader: reader,
		NetworkCatalog:     testNetworkCatalog(t),
		PersonalPodVNet:    "personal",
	}

	r := newVMTestEngine(http.MethodPost, "/vms", principalID, h.CreateVM)
	body := `{"target_folder_id":"` + targetFolderID.String() + `","name":"test-vm","networks":[{"bridge":"vmbr0","model":"virtio","vlan_tag":4000}]}`
	w := doJSONRequest(r, http.MethodPost, "/vms", body)

	assertStatus(t, w, http.StatusUnprocessableEntity)
	if proxmoxCalled {
		t.Fatal("Proxmox CreateVM was called for a manager's disallowed bridge under an active pod scope")
	}
}

func TestVMCreateGetBridges_NonManagerScopedForAllPodKinds(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		row  database.GetPodNetworkScopeForInventoryItemRow
	}{
		{
			name: "personal pod",
			row: database.GetPodNetworkScopeForInventoryItemRow{
				Kind:          database.PodNetworkAllocationKindPersonalPod,
				FolderID:      uuid.New(),
				NetworkNumber: 42,
			},
		},
		{
			name: "development pod",
			row: database.GetPodNetworkScopeForInventoryItemRow{
				Kind:              database.PodNetworkAllocationKindDevPod,
				FolderID:          uuid.New(),
				NetworkNumber:     17,
				NetworkProfileKey: strPtr(podnetwork.ProfileLANRouterV1),
			},
		},
		{
			name: "published clone pod",
			row: database.GetPodNetworkScopeForInventoryItemRow{
				Kind:              database.PodNetworkAllocationKindPublishedClone,
				FolderID:          uuid.New(),
				NetworkNumber:     5,
				NetworkProfileKey: strPtr(podnetwork.ProfileLANRouterV1),
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			principalID := uuid.New()
			scopeItemID := uuid.New()
			authz := &fakeVMCreateAuthz{hasAny: true, fakeVMAuthz: fakeVMAuthz{isManager: false}}
			reader := &fakePodNetworkScopeReader{row: tc.row}
			px := &fakeVMCreateProxmox{}
			px.getBridgesFn = func(context.Context, string) ([]proxmox.NetworkBridge, error) {
				return []proxmox.NetworkBridge{{Iface: "vmbr0"}}, nil
			}
			px.getVNetsFn = func(context.Context) ([]proxmox.VNet, error) {
				return []proxmox.VNet{{VNet: "unrelated"}, {VNet: "pod"}, {VNet: "dmz"}}, nil
			}
			h := &VMCreateHandler{
				Authz:              authz,
				PX:                 px,
				NetworkScopeReader: reader,
				NetworkCatalog:     testNetworkCatalog(t),
				PersonalPodVNet:    "personal",
			}

			r := newVMTestEngine(http.MethodGet, "/proxmox/nodes/:node/bridges", principalID, h.GetBridges)
			w := doJSONRequest(r, http.MethodGet, "/proxmox/nodes/pve1/bridges?scope_item_id="+scopeItemID.String(), "")

			assertStatus(t, w, http.StatusOK)

			var response struct {
				Bridges       []proxmox.NetworkBridge `json:"bridges"`
				VNets         []proxmox.VNet          `json:"vnets"`
				ScopedNetwork *scopedNetworkResponse  `json:"scoped_network"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if len(response.Bridges) != 0 {
				t.Fatalf("bridges = %#v, want no raw bridge choices for a scoped pod", response.Bridges)
			}
			if response.ScopedNetwork == nil {
				t.Fatal("scoped_network missing")
			}
			for _, vnet := range response.VNets {
				if vnet.VNet == "unrelated" {
					t.Fatalf("vnets unexpectedly include an unrelated VNet: %#v", response.VNets)
				}
			}
		})
	}
}

func TestVMCreateGetBridges_ManagerUnrestricted(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	scopeItemID := uuid.New()
	authz := &fakeVMCreateAuthz{fakeVMAuthz: fakeVMAuthz{isManager: true}}
	// No NetworkScopeReader/NetworkCatalog configured: a manager must never reach the scope resolver here.
	px := &fakeVMCreateProxmox{}
	px.getBridgesFn = func(context.Context, string) ([]proxmox.NetworkBridge, error) {
		return []proxmox.NetworkBridge{{Iface: "vmbr0"}}, nil
	}
	px.getVNetsFn = func(context.Context) ([]proxmox.VNet, error) {
		return []proxmox.VNet{{VNet: "unrelated"}, {VNet: "pod"}}, nil
	}
	h := &VMCreateHandler{
		Authz:           authz,
		PX:              px,
		PersonalPodVNet: "personal",
	}

	r := newVMTestEngine(http.MethodGet, "/proxmox/nodes/:node/bridges", principalID, h.GetBridges)
	w := doJSONRequest(r, http.MethodGet, "/proxmox/nodes/pve1/bridges?scope_item_id="+scopeItemID.String(), "")

	assertStatus(t, w, http.StatusOK)

	var response struct {
		Bridges       []proxmox.NetworkBridge `json:"bridges"`
		VNets         []proxmox.VNet          `json:"vnets"`
		ScopedNetwork *scopedNetworkResponse  `json:"scoped_network"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response.Bridges) != 1 || len(response.VNets) != 2 {
		t.Fatalf("response = %#v, want the unrestricted bridge/vnet list for a manager", response)
	}
	if response.ScopedNetwork != nil {
		t.Fatalf("scoped_network = %#v, want nil for a manager", response.ScopedNetwork)
	}
}

func TestVMCreateGetCreateOptions_HappyPathUsesFirstNodeAndCallsGetNodesOnce(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	authz := &fakeVMCreateAuthz{hasAny: true}

	var storagesNode, networksNode string
	px := &fakeVMCreateProxmox{
		nodes: []proxmox.Node{
			{Node: "pve1", Status: "online"},
			{Node: "pve2", Status: "online"},
		},
		getCreateStorages: func(_ context.Context, node string) ([]proxmox.Storage, []proxmox.Storage, error) {
			storagesNode = node
			return []proxmox.Storage{{Storage: "disk1"}}, []proxmox.Storage{{Storage: "iso1"}}, nil
		},
		getCreateNetworks: func(_ context.Context, node string) ([]proxmox.NetworkBridge, []proxmox.VNet, error) {
			networksNode = node
			return []proxmox.NetworkBridge{{Iface: "vmbr0"}}, []proxmox.VNet{{VNet: "vnet1"}}, nil
		},
	}
	h := newVMCreateTestHandler(authz, px)

	// ResolvePrimaryNode panics on this fake if configured for a test; reaching
	// this assertion at all proves GetCreateOptions no longer calls it.
	r := newVMTestEngine(http.MethodGet, "/proxmox/create/options", principalID, h.GetCreateOptions)
	w := doJSONRequest(r, http.MethodGet, "/proxmox/create/options", "")

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, `"node":"pve1"`)
	assertBodyContains(t, w, `"node":"pve2"`)
	assertBodyContains(t, w, `"storage":"disk1"`)
	assertBodyContains(t, w, `"storage":"iso1"`)
	assertBodyContains(t, w, `"iface":"vmbr0"`)
	assertBodyContains(t, w, `"vnet":"vnet1"`)

	if got := px.nodesCalls.Load(); got != 1 {
		t.Fatalf("GetNodes call count = %d, want 1", got)
	}
	if storagesNode != "pve1" {
		t.Fatalf("GetCreateStorages node = %q, want %q", storagesNode, "pve1")
	}
	if networksNode != "pve1" {
		t.Fatalf("GetCreateNetworks node = %q, want %q", networksNode, "pve1")
	}
}

func TestVMCreateGetCreateOptions_StorageAndNetworkOverlap(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	authz := &fakeVMCreateAuthz{hasAny: true}

	storageStarted := make(chan struct{})
	networkStarted := make(chan struct{})
	release := make(chan struct{})

	px := &fakeVMCreateProxmox{
		nodes: []proxmox.Node{{Node: "pve1"}},
		getCreateStorages: func(_ context.Context, _ string) ([]proxmox.Storage, []proxmox.Storage, error) {
			close(storageStarted)
			<-release
			return []proxmox.Storage{{Storage: "disk1"}}, []proxmox.Storage{{Storage: "iso1"}}, nil
		},
		getCreateNetworks: func(_ context.Context, _ string) ([]proxmox.NetworkBridge, []proxmox.VNet, error) {
			close(networkStarted)
			<-release
			return []proxmox.NetworkBridge{{Iface: "vmbr0"}}, []proxmox.VNet{{VNet: "vnet1"}}, nil
		},
	}
	h := newVMCreateTestHandler(authz, px)
	r := newVMTestEngine(http.MethodGet, "/proxmox/create/options", principalID, h.GetCreateOptions)

	done := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		done <- doJSONRequest(r, http.MethodGet, "/proxmox/create/options", "")
	}()

	select {
	case <-storageStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the storage fetch to start")
	}
	select {
	case <-networkStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the network fetch to start")
	}

	close(release)

	select {
	case w := <-done:
		assertStatus(t, w, http.StatusOK)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for handler completion")
	}
}

func TestVMCreateGetCreateOptions_EmptyNodesReturnsControlledError(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	authz := &fakeVMCreateAuthz{hasAny: true}
	px := &fakeVMCreateProxmox{nodes: []proxmox.Node{}}
	h := newVMCreateTestHandler(authz, px)

	r := newVMTestEngine(http.MethodGet, "/proxmox/create/options", principalID, h.GetCreateOptions)
	w := doJSONRequest(r, http.MethodGet, "/proxmox/create/options", "")

	assertStatus(t, w, http.StatusBadGateway)
	assertBodyContains(t, w, "failed to resolve primary node")
}

func TestVMCreateGetCreateOptions_StorageErrorReturnsStableMessage(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	authz := &fakeVMCreateAuthz{hasAny: true}
	px := &fakeVMCreateProxmox{
		nodes: []proxmox.Node{{Node: "pve1"}},
		getCreateStorages: func(_ context.Context, _ string) ([]proxmox.Storage, []proxmox.Storage, error) {
			return nil, nil, errors.New("boom")
		},
		getCreateNetworks: func(_ context.Context, _ string) ([]proxmox.NetworkBridge, []proxmox.VNet, error) {
			return []proxmox.NetworkBridge{}, []proxmox.VNet{}, nil
		},
	}
	h := newVMCreateTestHandler(authz, px)

	r := newVMTestEngine(http.MethodGet, "/proxmox/create/options", principalID, h.GetCreateOptions)
	w := doJSONRequest(r, http.MethodGet, "/proxmox/create/options", "")

	assertStatus(t, w, http.StatusBadGateway)
	assertBodyContains(t, w, "failed to fetch storages")
}

func TestVMCreateGetCreateOptions_NetworkErrorReturnsStableMessage(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	authz := &fakeVMCreateAuthz{hasAny: true}
	px := &fakeVMCreateProxmox{
		nodes: []proxmox.Node{{Node: "pve1"}},
		getCreateStorages: func(_ context.Context, _ string) ([]proxmox.Storage, []proxmox.Storage, error) {
			return []proxmox.Storage{}, []proxmox.Storage{}, nil
		},
		getCreateNetworks: func(_ context.Context, _ string) ([]proxmox.NetworkBridge, []proxmox.VNet, error) {
			return nil, nil, errors.New("boom")
		},
	}
	h := newVMCreateTestHandler(authz, px)

	r := newVMTestEngine(http.MethodGet, "/proxmox/create/options", principalID, h.GetCreateOptions)
	w := doJSONRequest(r, http.MethodGet, "/proxmox/create/options", "")

	assertStatus(t, w, http.StatusBadGateway)
	assertBodyContains(t, w, "failed to fetch networks")
}

func TestVMCreateGetCreateOptions_DevPodLANAndDMZScope(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	scopeItemID := uuid.New()
	authz := &fakeVMCreateAuthz{hasAny: true, fakeVMAuthz: fakeVMAuthz{isManager: false}}
	reader := &fakePodNetworkScopeReader{row: database.GetPodNetworkScopeForInventoryItemRow{
		Kind:              database.PodNetworkAllocationKindDevPod,
		FolderID:          uuid.New(),
		NetworkNumber:     199,
		NetworkProfileKey: strPtr(podnetwork.ProfileLANDMZRouterV1),
	}}
	px := &fakeVMCreateProxmox{
		nodes: []proxmox.Node{{Node: "pve1"}},
		getCreateStorages: func(_ context.Context, _ string) ([]proxmox.Storage, []proxmox.Storage, error) {
			return []proxmox.Storage{}, []proxmox.Storage{}, nil
		},
		getCreateNetworks: func(_ context.Context, _ string) ([]proxmox.NetworkBridge, []proxmox.VNet, error) {
			return []proxmox.NetworkBridge{{Iface: "vmbr0"}},
				[]proxmox.VNet{{VNet: "unrelated"}, {VNet: "pod"}, {VNet: "dmz"}}, nil
		},
	}
	h := &VMCreateHandler{
		Authz:              authz,
		PX:                 px,
		NetworkScopeReader: reader,
		NetworkCatalog:     testNetworkCatalog(t),
		PersonalPodVNet:    "personal",
	}

	r := newVMTestEngine(http.MethodGet, "/proxmox/create/options", principalID, h.GetCreateOptions)
	w := doJSONRequest(r, http.MethodGet, "/proxmox/create/options?scope_item_id="+scopeItemID.String(), "")

	assertStatus(t, w, http.StatusOK)

	var response createOptionsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.ScopedNetwork == nil {
		t.Fatal("scoped_network missing")
	}
	if response.ScopedNetwork.VLANTag != 199 {
		t.Fatalf("vlan_tag = %d, want 199", response.ScopedNetwork.VLANTag)
	}
	if response.ScopedNetwork.Bridge != "pod" {
		t.Fatalf("bridge = %q, want pod (LAN default)", response.ScopedNetwork.Bridge)
	}
	if len(response.ScopedNetwork.AllowedBridges) != 2 {
		t.Fatalf("allowed_bridges = %#v, want 2 entries", response.ScopedNetwork.AllowedBridges)
	}
	if len(response.Bridges) != 0 {
		t.Fatalf("bridges = %#v, want no raw bridge choices for a scoped pod", response.Bridges)
	}
	if len(response.VNets) != 2 {
		t.Fatalf("vnets = %#v, want only pod and dmz", response.VNets)
	}
	for _, vnet := range response.VNets {
		if vnet.VNet == "unrelated" {
			t.Fatalf("vnets unexpectedly include an unrelated VNet: %#v", response.VNets)
		}
	}
	if response.PersonalPodTemplatesRestricted {
		t.Fatal("personal_pod_templates_restricted = true, want false for a non-personal pod")
	}
}

func TestVMCreateGetCreateOptions_ManagerReceivesSameNetworkScope(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	scopeItemID := uuid.New()
	authz := &fakeVMCreateAuthz{hasAny: true, fakeVMAuthz: fakeVMAuthz{isManager: true}}
	reader := &fakePodNetworkScopeReader{row: database.GetPodNetworkScopeForInventoryItemRow{
		Kind:          database.PodNetworkAllocationKindPersonalPod,
		FolderID:      uuid.New(),
		NetworkNumber: 7,
	}}
	px := &fakeVMCreateProxmox{
		nodes: []proxmox.Node{{Node: "pve1"}},
		getCreateStorages: func(_ context.Context, _ string) ([]proxmox.Storage, []proxmox.Storage, error) {
			return []proxmox.Storage{}, []proxmox.Storage{}, nil
		},
		getCreateNetworks: func(_ context.Context, _ string) ([]proxmox.NetworkBridge, []proxmox.VNet, error) {
			return []proxmox.NetworkBridge{{Iface: "vmbr0"}}, []proxmox.VNet{{VNet: "personal"}}, nil
		},
	}
	h := &VMCreateHandler{
		Authz:              authz,
		PX:                 px,
		NetworkScopeReader: reader,
		NetworkCatalog:     testNetworkCatalog(t),
		PersonalPodVNet:    "personal",
	}

	r := newVMTestEngine(http.MethodGet, "/proxmox/create/options", principalID, h.GetCreateOptions)
	w := doJSONRequest(r, http.MethodGet, "/proxmox/create/options?scope_item_id="+scopeItemID.String(), "")

	assertStatus(t, w, http.StatusOK)

	var response createOptionsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.ScopedNetwork == nil || response.ScopedNetwork.VLANTag != 7 || response.ScopedNetwork.Bridge != "personal" {
		t.Fatalf("scoped_network = %#v, want manager to receive the same enforced network as a non-manager", response.ScopedNetwork)
	}
	if response.PersonalPodTemplatesRestricted {
		t.Fatal("personal_pod_templates_restricted = true, want false for a manager")
	}
	if response.PersonalPodTemplatesFolderID != nil {
		t.Fatal("personal_pod_templates_folder_id set, want nil for a manager (unrestricted template list)")
	}
}
