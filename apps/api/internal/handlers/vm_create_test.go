package handlers

import (
	"context"
	"net/http"
	"testing"

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
	nodes    []proxmox.Node
	nodesErr error
}

func (f *fakeVMCreateProxmox) GetNodes(_ context.Context) ([]proxmox.Node, error) {
	return f.nodes, f.nodesErr
}

func (f *fakeVMCreateProxmox) ResolvePrimaryNode(_ context.Context) (proxmox.Node, error) {
	panic("fakeVMCreateProxmox: ResolvePrimaryNode not configured for this test")
}

func (f *fakeVMCreateProxmox) GetCreateStorages(_ context.Context, _ string) ([]proxmox.Storage, []proxmox.Storage, error) {
	panic("fakeVMCreateProxmox: GetCreateStorages not configured for this test")
}

func (f *fakeVMCreateProxmox) GetCreateNetworks(_ context.Context, _ string) ([]proxmox.NetworkBridge, []proxmox.VNet, error) {
	panic("fakeVMCreateProxmox: GetCreateNetworks not configured for this test")
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
