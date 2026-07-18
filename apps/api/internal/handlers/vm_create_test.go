package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

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

func (f *fakeVMCreateProxmox) GetBridges(_ context.Context, _ string) ([]proxmox.NetworkBridge, error) {
	panic("fakeVMCreateProxmox: GetBridges not configured for this test")
}

func (f *fakeVMCreateProxmox) GetVNets(_ context.Context) ([]proxmox.VNet, error) {
	panic("fakeVMCreateProxmox: GetVNets not configured for this test")
}

func (f *fakeVMCreateProxmox) GetOptimalNode(_ context.Context) (proxmox.Node, error) {
	panic("fakeVMCreateProxmox: GetOptimalNode not configured for this test")
}

func (f *fakeVMCreateProxmox) CreateVM(_ context.Context, _ string, _ map[string]string) error {
	panic("fakeVMCreateProxmox: CreateVM not configured for this test")
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
