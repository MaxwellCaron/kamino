package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// fakeVMAuthz is a minimal, configurable vmAuthz implementation used to
// characterize the permission-denial / not-found / error-shape branches of
// the VM mutation handlers without a live database.
type fakeVMAuthz struct {
	requireErr        error
	vmRecord          authorization.VMRecord
	vmRecordErr       error
	filterStatuses    map[int]string
	filterStatusesErr error
	isManager         bool
}

func (f *fakeVMAuthz) Require(ctx context.Context, principalID uuid.UUID, itemID uuid.UUID, required authorization.Mask) error {
	return f.requireErr
}

func (f *fakeVMAuthz) GetVMRecord(ctx context.Context, itemID uuid.UUID) (authorization.VMRecord, error) {
	return f.vmRecord, f.vmRecordErr
}

func (f *fakeVMAuthz) GetVMRecordForUpdate(ctx context.Context, itemID uuid.UUID) (authorization.VMRecord, error) {
	return f.vmRecord, f.vmRecordErr
}

func (f *fakeVMAuthz) ResolveVMItems(
	ctx context.Context,
	principalID uuid.UUID,
	itemIDs []uuid.UUID,
	required authorization.Mask,
	lock bool,
) (map[uuid.UUID]authorization.VMItemAccess, error) {
	if f.requireErr != nil {
		switch {
		case errors.Is(f.requireErr, authorization.ErrForbidden):
			result := make(map[uuid.UUID]authorization.VMItemAccess, len(itemIDs))
			for _, itemID := range itemIDs {
				result[itemID] = authorization.VMItemAccess{Allowed: false}
			}
			return result, nil
		case errors.Is(f.requireErr, pgx.ErrNoRows):
			return map[uuid.UUID]authorization.VMItemAccess{}, nil
		default:
			return nil, f.requireErr
		}
	}

	if f.vmRecordErr != nil {
		switch {
		case errors.Is(f.vmRecordErr, pgx.ErrNoRows):
			result := make(map[uuid.UUID]authorization.VMItemAccess, len(itemIDs))
			for _, itemID := range itemIDs {
				result[itemID] = authorization.VMItemAccess{Allowed: true}
			}
			return result, nil
		default:
			return nil, f.vmRecordErr
		}
	}

	result := make(map[uuid.UUID]authorization.VMItemAccess, len(itemIDs))
	for _, itemID := range itemIDs {
		record := f.vmRecord
		if record.InventoryItemID == uuid.Nil {
			record.InventoryItemID = itemID
		}
		result[itemID] = authorization.VMItemAccess{
			Allowed: true,
			HasVM:   true,
			Record:  record,
		}
	}

	return result, nil
}

func (f *fakeVMAuthz) FilterVisibleStatuses(ctx context.Context, principalID uuid.UUID, statuses map[int]string) (map[int]string, error) {
	return f.filterStatuses, f.filterStatusesErr
}

func (f *fakeVMAuthz) IsManager(ctx context.Context, principalID uuid.UUID) (bool, error) {
	return f.isManager, nil
}

var _ vmAuthz = (*fakeVMAuthz)(nil)

// fakeVMProxmox is a minimal, configurable vmProxmox implementation used to
// characterize the identity-verification branches of the VM mutation
// handlers without a live Proxmox client. Only GetVMIdentity is exercised by
// the permission/error-branch characterization tests in this file; every
// other method is implemented to satisfy the interface and panics if called,
// so a test that unexpectedly reaches Proxmox wire calls fails loudly rather
// than silently returning a zero value.
type fakeVMProxmox struct {
	identity    *proxmox.VMIdentity
	identityErr error
}

func (f *fakeVMProxmox) GetVMIdentity(ctx context.Context, node string, vmid int) (*proxmox.VMIdentity, error) {
	return f.identity, f.identityErr
}

func (f *fakeVMProxmox) GetVMs(ctx context.Context) ([]proxmox.VM, error) {
	panic("fakeVMProxmox: GetVMs not configured for this test")
}

func (f *fakeVMProxmox) RenameVM(ctx context.Context, node string, vmid int, name string) error {
	panic("fakeVMProxmox: RenameVM not configured for this test")
}

func (f *fakeVMProxmox) UpdateVMNotes(ctx context.Context, node string, vmid int, notes string) error {
	panic("fakeVMProxmox: UpdateVMNotes not configured for this test")
}

func (f *fakeVMProxmox) GetVMHardwareConfig(ctx context.Context, node string, vmid int) (*proxmox.VMHardwareConfig, error) {
	panic("fakeVMProxmox: GetVMHardwareConfig not configured for this test")
}

func (f *fakeVMProxmox) UpdateVMHardware(ctx context.Context, node string, vmid int, config proxmox.VMHardwareConfig) error {
	panic("fakeVMProxmox: UpdateVMHardware not configured for this test")
}

func (f *fakeVMProxmox) GetOptimalNode(ctx context.Context) (proxmox.Node, error) {
	panic("fakeVMProxmox: GetOptimalNode not configured for this test")
}

func (f *fakeVMProxmox) GetNextVMID(ctx context.Context) (int, error) {
	panic("fakeVMProxmox: GetNextVMID not configured for this test")
}

func (f *fakeVMProxmox) IsVMIDAvailable(ctx context.Context, vmid int) (bool, error) {
	panic("fakeVMProxmox: IsVMIDAvailable not configured for this test")
}

func (f *fakeVMProxmox) CloneVM(ctx context.Context, node string, vmid int, newid int, name string, full bool, target string) error {
	panic("fakeVMProxmox: CloneVM not configured for this test")
}

func (f *fakeVMProxmox) SetVMUpstreamUUID(ctx context.Context, node string, vmid int, upstreamUUID uuid.UUID) error {
	panic("fakeVMProxmox: SetVMUpstreamUUID not configured for this test")
}

func (f *fakeVMProxmox) SyncVMPoolMembership(ctx context.Context, node string, vmid int, desiredPool string, path []string) error {
	panic("fakeVMProxmox: SyncVMPoolMembership not configured for this test")
}

func (f *fakeVMProxmox) GetSnapshots(ctx context.Context, node string, vmid int) ([]proxmox.Snapshot, error) {
	panic("fakeVMProxmox: GetSnapshots not configured for this test")
}

func (f *fakeVMProxmox) DeleteSnapshot(ctx context.Context, node string, vmid int, snapname string) error {
	panic("fakeVMProxmox: DeleteSnapshot not configured for this test")
}

func (f *fakeVMProxmox) ConvertToTemplate(ctx context.Context, node string, vmid int) error {
	panic("fakeVMProxmox: ConvertToTemplate not configured for this test")
}

func (f *fakeVMProxmox) DeleteVM(ctx context.Context, node string, vmid int) error {
	panic("fakeVMProxmox: DeleteVM not configured for this test")
}

var _ vmProxmox = (*fakeVMProxmox)(nil)

// newVMTestHandler builds a VMHandler wired with the given fakes. Fields not
// needed by the permission/error branches under test (Service, Notifier,
// Actions, Claims, Audit, Importer) are left nil; those branches return
// before the handler ever touches them.
func newVMTestHandler(authz vmAuthz, px vmProxmox) *VMHandler {
	return &VMHandler{
		PX:    px,
		Authz: authz,
	}
}

// withPrincipal mounts a stub middleware that sets the authenticated
// principal on the gin context, mirroring how the real auth middleware
// populates "userID" before handlers run.
func withPrincipal(principalID uuid.UUID) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("userID", principalID)
		c.Next()
	}
}

func newVMTestEngine(method, path string, principalID uuid.UUID, handler gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Handle(method, path, withPrincipal(principalID), handler)
	return r
}

func doJSONRequest(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	var reqBody *strings.Reader
	if body == "" {
		reqBody = strings.NewReader("")
	} else {
		reqBody = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reqBody)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func assertStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("expected status %d, got %d (body=%s)", want, w.Code, w.Body.String())
	}
}

func assertBodyContains(t *testing.T, w *httptest.ResponseRecorder, substr string) {
	t.Helper()
	if !strings.Contains(w.Body.String(), substr) {
		t.Fatalf("expected body to contain %q, got %s", substr, w.Body.String())
	}
}

// --- DeleteVM (bulk) ---------------------------------------------------

func TestVMDeleteVM_PermissionDenied(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: authorization.ErrForbidden}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodDelete, "/vms", principalID, h.DeleteVM)
	w := doJSONRequest(r, http.MethodDelete, "/vms", `{"item_ids":["`+itemID.String()+`"]}`)

	// DeleteVM is a bulk handler: per-item failures are reported with 200 +
	// a Failed entry, not a top-level 403. Characterize that shape.
	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "forbidden")
}

func TestVMDeleteVM_NotFound(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: pgx.ErrNoRows}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodDelete, "/vms", principalID, h.DeleteVM)
	w := doJSONRequest(r, http.MethodDelete, "/vms", `{"item_ids":["`+itemID.String()+`"]}`)

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "item not found")
}

func TestVMDeleteVM_VMRecordNotFound(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{vmRecordErr: pgx.ErrNoRows}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodDelete, "/vms", principalID, h.DeleteVM)
	w := doJSONRequest(r, http.MethodDelete, "/vms", `{"item_ids":["`+itemID.String()+`"]}`)

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "vm not found")
}

func TestVMDeleteVM_IdentityMismatch(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()
	storedUUID := uuid.New()
	upstreamUUID := uuid.New() // deliberately different from storedUUID

	authz := &fakeVMAuthz{
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            "node-a",
			Vmid:            101,
			UpstreamUUID:    storedUUID,
		},
	}
	px := &fakeVMProxmox{identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID}}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodDelete, "/vms", principalID, h.DeleteVM)
	w := doJSONRequest(r, http.MethodDelete, "/vms", `{"item_ids":["`+itemID.String()+`"]}`)

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "inventory mapping is stale; upstream VM identity no longer matches")
}

func TestVMDeleteVM_IdentityNotConfigured(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            "node-a",
			Vmid:            101,
			UpstreamUUID:    uuid.New(),
		},
	}
	px := &fakeVMProxmox{identityErr: proxmox.ErrVMIdentityNotConfigured}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodDelete, "/vms", principalID, h.DeleteVM)
	w := doJSONRequest(r, http.MethodDelete, "/vms", `{"item_ids":["`+itemID.String()+`"]}`)

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "vm identity is not initialized in Proxmox")
}

func TestVMDeleteVM_Unauthenticated(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := newVMTestHandler(&fakeVMAuthz{}, &fakeVMProxmox{})
	// No withPrincipal middleware: simulate a request with no authenticated
	// principal in the gin context.
	r.Handle(http.MethodDelete, "/vms", h.DeleteVM)

	w := doJSONRequest(r, http.MethodDelete, "/vms", `{"item_ids":["`+uuid.New().String()+`"]}`)

	assertStatus(t, w, http.StatusUnauthorized)
	assertBodyContains(t, w, "authentication required")
}

// --- PowerAction (bulk) --------------------------------------------------

func TestVMPowerAction_PermissionDenied(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: authorization.ErrForbidden}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	w := doJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"start","item_ids":["`+itemID.String()+`"]}`)

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "forbidden")
}

func TestVMPowerAction_NotFound(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: pgx.ErrNoRows}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	w := doJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"start","item_ids":["`+itemID.String()+`"]}`)

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "item not found")
}

func TestVMPowerAction_VMRecordNotFound(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{vmRecordErr: pgx.ErrNoRows}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	w := doJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"start","item_ids":["`+itemID.String()+`"]}`)

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "vm not found")
}

func TestVMPowerAction_IdentityMismatch(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()
	storedUUID := uuid.New()
	upstreamUUID := uuid.New()

	authz := &fakeVMAuthz{
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            "node-a",
			Vmid:            202,
			UpstreamUUID:    storedUUID,
		},
	}
	px := &fakeVMProxmox{identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID}}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	w := doJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"start","item_ids":["`+itemID.String()+`"]}`)

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "inventory mapping is stale; upstream VM identity no longer matches")
}

func TestVMPowerAction_IdentityNotConfigured(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            "node-a",
			Vmid:            202,
			UpstreamUUID:    uuid.New(),
		},
	}
	px := &fakeVMProxmox{identityErr: proxmox.ErrVMIdentityInvalid}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	w := doJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"start","item_ids":["`+itemID.String()+`"]}`)

	assertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "vm identity is not initialized in Proxmox")
}

func TestVMPowerAction_InvalidBody(t *testing.T) {
	principalID := uuid.New()

	authz := &fakeVMAuthz{}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := newVMTestEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	// "action" must be one of start/shutdown/reboot/stop; "bogus" fails
	// binding validation before any authz/proxmox call.
	w := doJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"bogus","item_ids":["`+uuid.New().String()+`"]}`)

	assertStatus(t, w, http.StatusBadRequest)
}

// --- RollbackSnapshot (single-item) --------------------------------------

func mountVMItemRoute(method, path string, principalID uuid.UUID, handler gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Handle(method, path, withPrincipal(principalID), handler)
	return r
}

func TestVMRollbackSnapshot_PermissionDenied(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: authorization.ErrForbidden}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := mountVMItemRoute(http.MethodPost, "/items/:id/vm/snapshots/rollback", principalID, h.RollbackSnapshot)
	w := doJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	assertStatus(t, w, http.StatusForbidden)
	assertBodyContains(t, w, "forbidden")
}

func TestVMRollbackSnapshot_NotFound(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: pgx.ErrNoRows}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := mountVMItemRoute(http.MethodPost, "/items/:id/vm/snapshots/rollback", principalID, h.RollbackSnapshot)
	w := doJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	assertStatus(t, w, http.StatusNotFound)
	assertBodyContains(t, w, "item not found")
}

func TestVMRollbackSnapshot_VMRecordNotFound(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{vmRecordErr: pgx.ErrNoRows}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := mountVMItemRoute(http.MethodPost, "/items/:id/vm/snapshots/rollback", principalID, h.RollbackSnapshot)
	w := doJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	assertStatus(t, w, http.StatusNotFound)
	assertBodyContains(t, w, "vm not found")
}

func TestVMRollbackSnapshot_IdentityMismatch(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()
	storedUUID := uuid.New()
	upstreamUUID := uuid.New()

	authz := &fakeVMAuthz{
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            "node-a",
			Vmid:            303,
			UpstreamUUID:    storedUUID,
		},
	}
	px := &fakeVMProxmox{identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID}}
	h := newVMTestHandler(authz, px)

	r := mountVMItemRoute(http.MethodPost, "/items/:id/vm/snapshots/rollback", principalID, h.RollbackSnapshot)
	w := doJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	assertStatus(t, w, http.StatusConflict)
	assertBodyContains(t, w, "inventory mapping is stale; upstream VM identity no longer matches")
}

func TestVMRollbackSnapshot_IdentityNotConfigured(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            "node-a",
			Vmid:            303,
			UpstreamUUID:    uuid.New(),
		},
	}
	px := &fakeVMProxmox{identityErr: proxmox.ErrVMIdentityNotConfigured}
	h := newVMTestHandler(authz, px)

	r := mountVMItemRoute(http.MethodPost, "/items/:id/vm/snapshots/rollback", principalID, h.RollbackSnapshot)
	w := doJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	assertStatus(t, w, http.StatusConflict)
	assertBodyContains(t, w, "vm identity is not initialized in Proxmox")
}

func TestVMRollbackSnapshot_InvalidBody(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := mountVMItemRoute(http.MethodPost, "/items/:id/vm/snapshots/rollback", principalID, h.RollbackSnapshot)
	// snapname is required; empty body fails binding before any authz call.
	w := doJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{}`)

	assertStatus(t, w, http.StatusBadRequest)
}

func TestVMRollbackSnapshot_Unauthenticated(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := newVMTestHandler(&fakeVMAuthz{}, &fakeVMProxmox{})
	r.Handle(http.MethodPost, "/items/:id/vm/snapshots/rollback", h.RollbackSnapshot)

	itemID := uuid.New()
	w := doJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	assertStatus(t, w, http.StatusUnauthorized)
	assertBodyContains(t, w, "authentication required")
}

// --- requestError plumbing sanity check ----------------------------------

// TestRequestErrorWrapsUnderlyingError documents that requestError.Error()
// surfaces the wrapped error's message (used by errgroup-style error
// channels elsewhere in the package), not just the user-facing message.
func TestRequestErrorWrapsUnderlyingError(t *testing.T) {
	wrapped := errors.New("boom")
	reqErr := &requestError{Status: http.StatusInternalServerError, UserMessage: "authorization failed", Err: wrapped}

	if got := reqErr.Error(); got != "boom" {
		t.Fatalf("expected wrapped error message, got %q", got)
	}
}

// --- UpdateHardware -------------------------------------------------------

// TestUpdateHardware_PermissionDenied characterizes that the permission-
// denial path still returns 403 after HasManagement moved onto the vmAuthz
// interface directly (removing the managementAuthorizer type assertion).
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
