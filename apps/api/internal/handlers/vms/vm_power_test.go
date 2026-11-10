package vms

import (
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlertest"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func TestVMPowerAction_PermissionDenied(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: authorization.ErrForbidden}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := handlertest.NewEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"start","item_ids":["`+itemID.String()+`"]}`)

	handlertest.AssertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "forbidden")
}

func TestVMPowerAction_NotFound(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{requireErr: pgx.ErrNoRows}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := handlertest.NewEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"start","item_ids":["`+itemID.String()+`"]}`)

	handlertest.AssertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "item not found")
}

func TestVMPowerAction_VMRecordNotFound(t *testing.T) {
	principalID := uuid.New()
	itemID := uuid.New()

	authz := &fakeVMAuthz{vmRecordErr: pgx.ErrNoRows}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := handlertest.NewEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"start","item_ids":["`+itemID.String()+`"]}`)

	handlertest.AssertStatus(t, w, http.StatusOK)
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
			GuestType:       "qemu",
			UpstreamUUID:    storedUUID,
		},
	}
	px := &fakeVMProxmox{identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID}}
	h := newVMTestHandler(authz, px)

	r := handlertest.NewEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"start","item_ids":["`+itemID.String()+`"]}`)

	handlertest.AssertStatus(t, w, http.StatusOK)
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
			GuestType:       "qemu",
			UpstreamUUID:    uuid.New(),
		},
	}
	px := &fakeVMProxmox{identityErr: proxmox.ErrVMIdentityInvalid}
	h := newVMTestHandler(authz, px)

	r := handlertest.NewEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"start","item_ids":["`+itemID.String()+`"]}`)

	handlertest.AssertStatus(t, w, http.StatusOK)
	assertBodyContains(t, w, "vm identity is not initialized in Proxmox")
}

func TestVMPowerAction_InvalidBody(t *testing.T) {
	principalID := uuid.New()

	authz := &fakeVMAuthz{}
	px := &fakeVMProxmox{}
	h := newVMTestHandler(authz, px)

	r := handlertest.NewEngine(http.MethodPost, "/vms/power", principalID, h.PowerAction)
	// "action" must be one of start/shutdown/reboot/stop; "bogus" fails
	// binding validation before any authz/proxmox call.
	w := handlertest.DoJSONRequest(r, http.MethodPost, "/vms/power", `{"action":"bogus","item_ids":["`+uuid.New().String()+`"]}`)

	handlertest.AssertStatus(t, w, http.StatusBadRequest)
}
