package handlers

import (
	"errors"
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

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
			GuestType:       "qemu",
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
			GuestType:       "qemu",
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

func TestVMActionTargetPropagatesAllFields(t *testing.T) {
	itemID := uuid.New()
	got := vmActionTarget(verifiedVMTarget{
		ItemID:    itemID,
		Node:      "node-a",
		VMID:      101,
		GuestType: proxmox.GuestLXC,
	})

	want := vmactions.Target{
		ItemID:    itemID,
		Node:      "node-a",
		VMID:      101,
		GuestType: proxmox.GuestLXC,
	}
	if got != want {
		t.Errorf("vmActionTarget() = %#v, want %#v", got, want)
	}
}

func TestRequestErrorWrapsUnderlyingError(t *testing.T) {
	wrapped := errors.New("boom")
	reqErr := &requestError{Status: http.StatusInternalServerError, UserMessage: "authorization failed", Err: wrapped}

	if got := reqErr.Error(); got != "boom" {
		t.Fatalf("expected wrapped error message, got %q", got)
	}
}
