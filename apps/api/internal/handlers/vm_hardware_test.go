package handlers

import (
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/google/uuid"
)

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
