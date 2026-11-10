package proxmoxprincipals

import (
	"testing"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

func TestProxmoxMembershipsUsesGroupUsers(t *testing.T) {
	memberships := proxmoxMemberships(
		[]proxmox.AccessUser{
			{UserID: "alice@pam", Groups: "Users"},
			{UserID: "root@pam"},
		},
		[]proxmox.AccessGroup{
			{GroupID: "Admins", Users: "root@pam, alice@pam"},
		},
	)

	want := map[proxmoxMembership]bool{
		{groupID: "Users", userID: "alice@pam"}:  true,
		{groupID: "Admins", userID: "root@pam"}:  true,
		{groupID: "Admins", userID: "alice@pam"}: true,
	}
	if len(memberships) != len(want) {
		t.Fatalf("memberships = %#v, want %d entries", memberships, len(want))
	}
	for _, membership := range memberships {
		if !want[membership] {
			t.Fatalf("unexpected membership %#v in %#v", membership, memberships)
		}
	}
}
