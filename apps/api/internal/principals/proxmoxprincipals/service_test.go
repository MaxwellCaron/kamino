package proxmoxprincipals

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
)

type fakeAccessClient struct {
	users  []proxmox.AccessUser
	groups []proxmox.AccessGroup

	createUserCalls []string
	updateUserCalls []struct {
		userid string
		groups []string
	}
}

func (f *fakeAccessClient) AuthenticateTicket(
	ctx context.Context,
	username, password, defaultRealm string,
) (proxmox.TicketAuthResult, error) {
	_ = ctx
	userid := normalizeManagedUserID(username, defaultRealm)
	if password != "good" {
		return proxmox.TicketAuthResult{}, principals.ErrInvalidCredentials
	}
	return proxmox.TicketAuthResult{UserID: userid}, nil
}

func (f *fakeAccessClient) ListAccessUsers(context.Context) ([]proxmox.AccessUser, error) {
	return append([]proxmox.AccessUser(nil), f.users...), nil
}

func (f *fakeAccessClient) ListAccessGroups(context.Context) ([]proxmox.AccessGroup, error) {
	return append([]proxmox.AccessGroup(nil), f.groups...), nil
}

func (f *fakeAccessClient) CreateAccessUser(
	ctx context.Context,
	userid, comment string,
	enabled bool,
) error {
	_ = ctx
	_ = comment
	_ = enabled
	f.createUserCalls = append(f.createUserCalls, userid)
	f.users = append(f.users, proxmox.AccessUser{UserID: userid, Enable: 1})
	return nil
}

func (f *fakeAccessClient) UpdateAccessUser(
	ctx context.Context,
	userid, comment string,
	enabled *bool,
	groups []string,
) error {
	_ = ctx
	_ = comment
	_ = enabled
	f.updateUserCalls = append(f.updateUserCalls, struct {
		userid string
		groups []string
	}{userid: userid, groups: append([]string(nil), groups...)})
	for index, user := range f.users {
		if user.UserID == userid {
			f.users[index].Groups = strings.Join(groups, ",")
			return nil
		}
	}
	return principals.ErrPrincipalNotFound
}

func (f *fakeAccessClient) DeleteAccessUser(context.Context, string) error { return nil }
func (f *fakeAccessClient) CreateAccessGroup(context.Context, string, string) error {
	return nil
}
func (f *fakeAccessClient) UpdateAccessGroup(context.Context, string, string) error { return nil }
func (f *fakeAccessClient) DeleteAccessGroup(context.Context, string) error         { return nil }

func TestAuthenticateDoesNotWriteDatabase(t *testing.T) {
	client := &fakeAccessClient{}
	service := &Service{
		client:       client,
		defaultRealm: "ad",
	}
	service.sync = NewSync(nil, client)

	result, err := service.Authenticate(context.Background(), "alice", "good")
	if err != nil {
		t.Fatalf("Authenticate() error = %v", err)
	}
	if result.ExternalID != "alice@ad" {
		t.Fatalf("ExternalID = %q, want alice@ad", result.ExternalID)
	}
}

func TestPasswordActionsUnsupported(t *testing.T) {
	service := &Service{}
	if err := service.SetPassword(context.Background(), uuid.New(), "secret"); !errors.Is(err, principals.ErrUnsupportedPrincipal) {
		t.Fatalf("SetPassword() = %v", err)
	}
	if err := service.ChangePassword(context.Background(), uuid.New(), "old", "new"); !errors.Is(err, principals.ErrUnsupportedPrincipal) {
		t.Fatalf("ChangePassword() = %v", err)
	}
}

func TestValidateProxmoxUserID(t *testing.T) {
	if err := ValidateProxmoxUserID("alice@ad"); err != nil {
		t.Fatalf("ValidateProxmoxUserID() = %v", err)
	}
	if err := ValidateProxmoxUserID("alice"); err == nil {
		t.Fatalf("expected error for missing realm")
	}
}

func TestNormalizeManagedUserID(t *testing.T) {
	if got := normalizeManagedUserID("alice", "ad"); got != "alice@ad" {
		t.Fatalf("got %q", got)
	}
	if got := normalizeManagedUserID("bob@pam", "ad"); got != "bob@pam" {
		t.Fatalf("got %q", got)
	}
}
