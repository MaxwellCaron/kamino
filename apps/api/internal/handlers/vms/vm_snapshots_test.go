package vms

import (
	"errors"
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/handlers/vmaccess"
	"github.com/MaxwellCaron/kamino/internal/handlertest"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func mountVMItemRoute(method, path string, principalID uuid.UUID, handler gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Handle(method, path, handlertest.WithPrincipal(principalID), handler)
	return r
}

func TestVMRollbackSnapshot_PermissionDenied(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: authorization.ErrForbidden}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := mountVMItemRoute(http.MethodPost, "/items/:id/vm/snapshots/rollback", principalID, h.RollbackSnapshot)
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	handlertest.AssertStatus(t, w, http.StatusForbidden)
	assertBodyContains(t, w, "forbidden")
}

func TestVMRollbackSnapshot_NotFound(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: pgx.ErrNoRows}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := mountVMItemRoute(http.MethodPost, "/items/:id/vm/snapshots/rollback", principalID, h.RollbackSnapshot)
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	handlertest.AssertStatus(t, w, http.StatusNotFound)
	assertBodyContains(t, w, "item not found")
}

func TestVMRollbackSnapshot_VMRecordNotFound(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{vmRecordErr: pgx.ErrNoRows}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := mountVMItemRoute(http.MethodPost, "/items/:id/vm/snapshots/rollback", principalID, h.RollbackSnapshot)
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	handlertest.AssertStatus(t, w, http.StatusNotFound)
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
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	handlertest.AssertStatus(t, w, http.StatusConflict)
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
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	handlertest.AssertStatus(t, w, http.StatusConflict)
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
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{}`)

	handlertest.AssertStatus(t, w, http.StatusBadRequest)
}

func TestVMRollbackSnapshot_Unauthenticated(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := newVMTestHandler(&fakeVMAuthz{}, &fakeVMProxmox{})
	r.Handle(http.MethodPost, "/items/:id/vm/snapshots/rollback", h.RollbackSnapshot)

	itemID := uuid.New()
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/items/"+itemID.String()+"/vm/snapshots/rollback", `{"snapname":"snap1"}`)

	handlertest.AssertStatus(t, w, http.StatusUnauthorized)
	assertBodyContains(t, w, "authentication required")
}

func TestVerifiedVMTargetFromRecordPropagatesActionCoordinates(t *testing.T) {
	itemID := uuid.New()
	got := vmaccess.VerifiedVMTargetFromRecord(authorization.VMRecord{
		InventoryItemID: itemID,
		Node:            "node-a",
		Vmid:            101,
		GuestType:       string(proxmox.GuestLXC),
	})

	want := vmactions.Target{
		ItemID:    itemID,
		Node:      "node-a",
		VMID:      101,
		GuestType: proxmox.GuestLXC,
	}
	if got != want {
		t.Errorf("verifiedVMTargetFromRecord() = %#v, want %#v", got, want)
	}
}

func TestRequestErrorWrapsUnderlyingError(t *testing.T) {
	wrapped := errors.New("boom")
	reqErr := &httpx.RequestError{Status: http.StatusInternalServerError, UserMessage: "authorization failed", Err: wrapped}

	if got := reqErr.Error(); got != "boom" {
		t.Fatalf("expected wrapped error message, got %q", got)
	}
}
