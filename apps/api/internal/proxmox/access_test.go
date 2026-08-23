package proxmox

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/principals"
)

func TestAuthenticateTicketPostsWithoutAuthorization(t *testing.T) {
	var (
		authHeader string
		form       url.Values
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api2/json/access/ticket" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		authHeader = r.Header.Get("Authorization")
		if err := r.ParseForm(); err != nil {
			t.Fatalf("parse form: %v", err)
		}
		form = r.PostForm
		writeAPIResponse(t, w, http.StatusOK, map[string]any{
			"username": "alice@ad",
		})
	}))
	defer server.Close()

	client := newTestClient(server)
	result, err := client.AuthenticateTicket(context.Background(), "alice", "secret", "ad")
	if err != nil {
		t.Fatalf("AuthenticateTicket() error = %v", err)
	}
	if authHeader != "" {
		t.Fatalf("Authorization header = %q, want empty", authHeader)
	}
	if form.Get("username") != "alice@ad" {
		t.Fatalf("username form value = %q, want alice@ad", form.Get("username"))
	}
	if form.Get("password") != "secret" {
		t.Fatalf("password form value = %q, want secret", form.Get("password"))
	}
	if result.UserID != "alice@ad" {
		t.Fatalf("UserID = %q, want alice@ad", result.UserID)
	}
}

func TestAuthenticateTicketPreservesExplicitRealm(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("parse form: %v", err)
		}
		if got := r.PostForm.Get("username"); got != "bob@pam" {
			t.Fatalf("username = %q, want bob@pam", got)
		}
		writeAPIResponse(t, w, http.StatusOK, map[string]any{
			"username": "bob@pam",
		})
	}))
	defer server.Close()

	client := newTestClient(server)
	result, err := client.AuthenticateTicket(context.Background(), "bob@pam", "secret", "ad")
	if err != nil {
		t.Fatalf("AuthenticateTicket() error = %v", err)
	}
	if result.UserID != "bob@pam" {
		t.Fatalf("UserID = %q, want bob@pam", result.UserID)
	}
}

func TestAuthenticateTicketInvalidCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	client := newTestClient(server)
	_, err := client.AuthenticateTicket(context.Background(), "alice", "bad", "ad")
	if !errors.Is(err, principals.ErrInvalidCredentials) {
		t.Fatalf("error = %v, want ErrInvalidCredentials", err)
	}
}

func TestListAccessUsersAndGroupsDecodeEnvelope(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api2/json/access/users":
			if got := r.URL.Query().Get("full"); got != "1" {
				t.Fatalf("full query value = %q, want 1", got)
			}
			writeAPIResponse(t, w, http.StatusOK, []map[string]any{
				{
					"userid":    "alice@ad",
					"comment":   "ops",
					"enable":    1,
					"groups":    "admins,users",
					"firstname": "Alice",
					"lastname":  "Example",
				},
			})
		case "/api2/json/access/groups":
			writeAPIResponse(t, w, http.StatusOK, []map[string]any{
				{
					"groupid": "admins",
					"comment": "admin group",
				},
			})
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	client := newTestClient(server)
	users, err := client.ListAccessUsers(context.Background())
	if err != nil {
		t.Fatalf("ListAccessUsers() error = %v", err)
	}
	if len(users) != 1 || users[0].UserID != "alice@ad" {
		t.Fatalf("users = %#v", users)
	}

	groups, err := client.ListAccessGroups(context.Background())
	if err != nil {
		t.Fatalf("ListAccessGroups() error = %v", err)
	}
	if len(groups) != 1 || groups[0].GroupID != "admins" {
		t.Fatalf("groups = %#v", groups)
	}
}

func TestAccessUserPathEscapesRealm(t *testing.T) {
	if got := accessUserPath("alice@ad"); got != "/api2/json/access/users/alice@ad" {
		t.Fatalf("accessUserPath() = %q", got)
	}
}

func TestNormalizeProxmoxUserID(t *testing.T) {
	if got := normalizeProxmoxUserID("alice", "ad"); got != "alice@ad" {
		t.Fatalf("normalizeProxmoxUserID(alice) = %q", got)
	}
	if got := normalizeProxmoxUserID("bob@pam", "ad"); got != "bob@pam" {
		t.Fatalf("normalizeProxmoxUserID(bob@pam) = %q", got)
	}
}

func TestParseAccessGroups(t *testing.T) {
	groups := ParseAccessGroups(" admins, users ,,ops ")
	if len(groups) != 3 || groups[0] != "admins" || groups[2] != "ops" {
		t.Fatalf("groups = %#v", groups)
	}
	if ParseAccessGroups("  ") != nil {
		t.Fatalf("expected nil for blank groups")
	}
}

func TestParseAccessUsers(t *testing.T) {
	users := ParseAccessUsers(" root@pam, alice@ad ,, ")
	if len(users) != 2 || users[0] != "root@pam" || users[1] != "alice@ad" {
		t.Fatalf("users = %#v", users)
	}
	if ParseAccessUsers("  ") != nil {
		t.Fatalf("expected nil for blank users")
	}
}

func TestUpdateAccessUserUsesEscapedPath(t *testing.T) {
	var (
		path string
		form url.Values
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		if err := r.ParseForm(); err != nil {
			t.Fatalf("parse form: %v", err)
		}
		form = r.PostForm
		writeAPIResponse(t, w, http.StatusOK, nil)
	}))
	defer server.Close()

	client := newTestClient(server)
	enabled := true
	if err := client.UpdateAccessUser(
		context.Background(),
		"alice@ad",
		"updated",
		&enabled,
	); err != nil {
		t.Fatalf("UpdateAccessUser() error = %v", err)
	}
	if !strings.Contains(path, "alice@ad") {
		t.Fatalf("path = %q, want userid in path", path)
	}
	if form.Has("groups") || form.Has("append") {
		t.Fatalf("ordinary user update unexpectedly changed groups: %v", form)
	}
}

func TestAddAccessUserGroupsUsesAppendSemantics(t *testing.T) {
	var form url.Values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("parse form: %v", err)
		}
		form = r.PostForm
		writeAPIResponse(t, w, http.StatusOK, nil)
	}))
	defer server.Close()

	client := newTestClient(server)
	if err := client.AddAccessUserGroups(
		context.Background(),
		"alice@ad",
		[]string{"admins", "operators"},
	); err != nil {
		t.Fatalf("AddAccessUserGroups() error = %v", err)
	}
	if got := form.Get("groups"); got != "admins,operators" {
		t.Fatalf("groups form value = %q, want admins,operators", got)
	}
	if got := form.Get("append"); got != "1" {
		t.Fatalf("append form value = %q, want 1", got)
	}
}

func TestSetAccessUserGroupsUsesReplacementSemantics(t *testing.T) {
	var form url.Values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("parse form: %v", err)
		}
		form = r.PostForm
		writeAPIResponse(t, w, http.StatusOK, nil)
	}))
	defer server.Close()

	client := newTestClient(server)
	if err := client.SetAccessUserGroups(
		context.Background(),
		"alice@ad",
		[]string{"operators"},
	); err != nil {
		t.Fatalf("SetAccessUserGroups() error = %v", err)
	}
	if got := form.Get("groups"); got != "operators" {
		t.Fatalf("groups form value = %q, want operators", got)
	}
	if form.Has("append") {
		t.Fatalf("append form value = %q, want omitted", form.Get("append"))
	}
}
