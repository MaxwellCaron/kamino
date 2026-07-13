package handlers

import (
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

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
			GuestType:       "qemu",
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
			GuestType:       "qemu",
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
