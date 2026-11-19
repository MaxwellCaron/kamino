package inventory

import (
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/google/uuid"
)

func TestInventoryViewsPreserveContainerGuestType(t *testing.T) {
	guestType := "lxc"
	id := uuid.New()
	tree := convertTreeRowsToVisibleRows([]database.GetVisibleInventoryTreeForPrincipalRow{{ID: id, GuestType: &guestType, AllowedMask: int64(authorization.View)}})
	protectedTree := toFullAccessInventoryRows([]database.GetAllInventoryItemsRow{{ID: id, GuestType: &guestType}})
	protectedItem := fullAccessInventoryItem(database.GetInventoryItemByIDRow{ID: id, GuestType: &guestType})
	if len(tree) != 1 || tree[0].GuestType == nil || *tree[0].GuestType != "lxc" || tree[0].AllowedMask != int64(authorization.View) {
		t.Fatalf("container tree row lost type or permissions: %+v", tree)
	}
	if len(protectedTree) != 1 || protectedTree[0].GuestType == nil || *protectedTree[0].GuestType != "lxc" || protectedTree[0].AllowedMask != int64(authorization.FullAccessMask) {
		t.Fatalf("protected container tree row lost type or permissions: %+v", protectedTree)
	}
	if protectedItem.GuestType == nil || *protectedItem.GuestType != "lxc" || protectedItem.AllowedMask != int64(authorization.FullAccessMask) {
		t.Fatalf("protected container lost type or permissions: %+v", protectedItem)
	}
}
