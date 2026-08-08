package proxmoxprincipals

import (
	"context"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

type readOnlyProxmoxSyncClient struct {
	groups []proxmox.AccessGroup
	users  []proxmox.AccessUser
}

func (c *readOnlyProxmoxSyncClient) ListAccessGroups(context.Context) ([]proxmox.AccessGroup, error) {
	return c.groups, nil
}

func (c *readOnlyProxmoxSyncClient) ListAccessUsers(context.Context) ([]proxmox.AccessUser, error) {
	return c.users, nil
}

func TestSyncClientRequiresOnlyProviderReads(t *testing.T) {
	client := &readOnlyProxmoxSyncClient{
		groups: []proxmox.AccessGroup{{GroupID: "admins"}},
		users:  []proxmox.AccessUser{{UserID: "root@pam"}},
	}
	sync := NewSync(nil, client)

	users, err := sync.client.ListAccessUsers(context.Background())
	if err != nil {
		t.Fatalf("ListAccessUsers() error = %v", err)
	}
	if len(users) != 1 || users[0].UserID != "root@pam" {
		t.Fatalf("users = %#v", users)
	}
}

func TestSyncMembershipUsesProxmoxGroups(t *testing.T) {
	groups := proxmox.ParseAccessGroups("admins,users")
	if len(groups) != 2 || groups[0] != "admins" {
		t.Fatalf("groups = %#v", groups)
	}
}

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
