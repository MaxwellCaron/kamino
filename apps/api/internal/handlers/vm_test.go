package handlers

import (
	"context"
	"errors"
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

func (f *fakeVMProxmox) GetVMIdentity(ctx context.Context, gt proxmox.GuestType, node string, vmid int) (*proxmox.VMIdentity, error) {
	return f.identity, f.identityErr
}

func (f *fakeVMProxmox) GetVMs(ctx context.Context) ([]proxmox.VM, error) {
	panic("fakeVMProxmox: GetVMs not configured for this test")
}

func (f *fakeVMProxmox) RenameVM(ctx context.Context, gt proxmox.GuestType, node string, vmid int, name string) error {
	panic("fakeVMProxmox: RenameVM not configured for this test")
}

func (f *fakeVMProxmox) UpdateVMNotes(ctx context.Context, gt proxmox.GuestType, node string, vmid int, notes string) error {
	panic("fakeVMProxmox: UpdateVMNotes not configured for this test")
}

func (f *fakeVMProxmox) GetVMHardwareConfig(ctx context.Context, node string, vmid int) (*proxmox.VMHardwareConfig, error) {
	panic("fakeVMProxmox: GetVMHardwareConfig not configured for this test")
}

func (f *fakeVMProxmox) GetLXCNetworks(ctx context.Context, node string, vmid int) ([]proxmox.VMHardwareNetwork, error) {
	panic("fakeVMProxmox: GetLXCNetworks not configured for this test")
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

func (f *fakeVMProxmox) GetSnapshots(ctx context.Context, gt proxmox.GuestType, node string, vmid int) ([]proxmox.Snapshot, error) {
	panic("fakeVMProxmox: GetSnapshots not configured for this test")
}

func (f *fakeVMProxmox) DeleteSnapshot(ctx context.Context, gt proxmox.GuestType, node string, vmid int, snapname string) error {
	panic("fakeVMProxmox: DeleteSnapshot not configured for this test")
}

func (f *fakeVMProxmox) ConvertToTemplate(ctx context.Context, node string, vmid int) error {
	panic("fakeVMProxmox: ConvertToTemplate not configured for this test")
}

func (f *fakeVMProxmox) DeleteVM(ctx context.Context, gt proxmox.GuestType, node string, vmid int) error {
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
