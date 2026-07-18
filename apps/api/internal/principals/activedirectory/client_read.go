package activedirectory

import (
	"context"
	"encoding/binary"
	"fmt"
	"strings"

	"github.com/go-ldap/ldap/v3"
)

func allUsersFilter() string {
	return "(&(objectClass=user)(objectCategory=person))"
}

func allGroupsFilter() string {
	return "(objectClass=group)"
}

// newUserSearchRequest builds the paged whole-subtree request used for full
// user sync. It is a pure constructor so the search boundary can be tested
// without a network connection.
func newUserSearchRequest(baseDN string) *ldap.SearchRequest {
	return ldap.NewSearchRequest(
		baseDN,
		ldap.ScopeWholeSubtree,
		ldap.NeverDerefAliases, 0, 0, false,
		allUsersFilter(),
		[]string{"objectSid", "sAMAccountName", "displayName", "description", "distinguishedName", "whenCreated", "userAccountControl"},
		nil,
	)
}

// newGroupSearchRequest builds the paged whole-subtree request used for
// group reads. It is a pure constructor so the search boundary can be tested
// without a network connection.
func newGroupSearchRequest(baseDN string) *ldap.SearchRequest {
	return ldap.NewSearchRequest(
		baseDN,
		ldap.ScopeWholeSubtree,
		ldap.NeverDerefAliases, 0, 0, false,
		allGroupsFilter(),
		[]string{"objectSid", "sAMAccountName", "displayName", "distinguishedName", "member", "whenCreated"},
		nil,
	)
}

// FetchUsers returns all user accounts under the configured user OU.
func (c *Client) FetchUsers(ctx context.Context) ([]User, error) {
	userOU := strings.TrimSpace(c.userOU)
	if userOU == "" {
		return nil, fmt.Errorf("LDAP_USER_OU is required to sync users")
	}

	conn, err := c.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	result, err := conn.SearchWithPaging(newUserSearchRequest(userOU), 1000)
	if err != nil {
		return nil, fmt.Errorf("ldap search users: %w", err)
	}

	users := make([]User, 0, len(result.Entries))
	for _, entry := range result.Entries {
		user, err := userFromEntry(entry)
		if err != nil {
			continue
		}
		users = append(users, user)
	}

	return users, nil
}

// FetchUserByDN returns a single user for an exact distinguished name.
func (c *Client) FetchUserByDN(ctx context.Context, userDN string) (*User, error) {
	conn, err := c.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return c.fetchUserByDN(conn, userDN)
}

func (c *Client) fetchUserByDN(conn *ldap.Conn, userDN string) (*User, error) {
	searchDN := strings.TrimSpace(userDN)
	if searchDN == "" {
		return nil, fmt.Errorf("user DN is required")
	}

	result, err := conn.Search(ldap.NewSearchRequest(
		searchDN,
		ldap.ScopeBaseObject,
		ldap.NeverDerefAliases, 1, 0, false,
		"(objectClass=user)",
		[]string{"objectSid", "sAMAccountName", "displayName", "description", "distinguishedName", "whenCreated", "userAccountControl"},
		nil,
	))
	if err != nil {
		return nil, fmt.Errorf("ldap search user by dn: %w", err)
	}
	if len(result.Entries) == 0 {
		return nil, nil
	}

	user, err := userFromEntry(result.Entries[0])
	if err != nil {
		return nil, err
	}

	return &user, nil
}

// FetchGroups returns all groups under the configured group OU.
func (c *Client) FetchGroups(ctx context.Context) ([]Group, error) {
	groupOU := strings.TrimSpace(c.groupOU)
	if groupOU == "" {
		return nil, fmt.Errorf("LDAP_GROUP_OU is required to sync groups")
	}
	return c.fetchGroups(ctx, groupOU)
}

// FetchGroupByDN returns a single group for an exact distinguished name.
func (c *Client) FetchGroupByDN(ctx context.Context, groupDN string) (*Group, error) {
	conn, err := c.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return c.fetchGroupByDN(conn, groupDN)
}

func (c *Client) fetchGroupByDN(conn *ldap.Conn, groupDN string) (*Group, error) {
	searchDN := strings.TrimSpace(groupDN)
	if searchDN == "" {
		return nil, fmt.Errorf("group DN is required")
	}

	result, err := conn.Search(ldap.NewSearchRequest(
		searchDN,
		ldap.ScopeBaseObject,
		ldap.NeverDerefAliases, 1, 0, false,
		"(objectClass=group)",
		[]string{"objectSid", "sAMAccountName", "displayName", "distinguishedName", "member", "whenCreated"},
		nil,
	))
	if err != nil {
		return nil, fmt.Errorf("ldap search group by dn: %w", err)
	}
	if len(result.Entries) == 0 {
		return nil, nil
	}

	group, err := groupFromEntry(result.Entries[0])
	if err != nil {
		return nil, err
	}

	return &group, nil
}

// FetchGroupsInDN returns groups under a specific DN subtree.
func (c *Client) FetchGroupsInDN(ctx context.Context, baseDN string) ([]Group, error) {
	return c.fetchGroups(ctx, baseDN)
}

func (c *Client) fetchGroups(ctx context.Context, baseDN string) ([]Group, error) {
	conn, err := c.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	searchBase := strings.TrimSpace(baseDN)
	if searchBase == "" {
		searchBase = c.baseDN
	}

	result, err := conn.SearchWithPaging(newGroupSearchRequest(searchBase), 1000)
	if err != nil {
		return nil, fmt.Errorf("ldap search groups: %w", err)
	}

	groups := make([]Group, 0, len(result.Entries))
	for _, entry := range result.Entries {
		group, err := groupFromEntry(entry)
		if err != nil {
			continue
		}
		groups = append(groups, group)
	}

	return groups, nil
}

// decodeSID converts a raw Windows SID byte slice to its string form
// (e.g. S-1-5-21-3623811015-...).
func decodeSID(b []byte) string {
	if len(b) < 8 {
		return ""
	}

	revision := b[0]
	subAuthorityCount := int(b[1])

	if len(b) < 8+4*subAuthorityCount {
		return ""
	}

	// 6-byte big-endian authority value
	var authority uint64
	for i := 2; i < 8; i++ {
		authority = authority<<8 | uint64(b[i])
	}

	parts := make([]string, 0, 3+subAuthorityCount)
	parts = append(parts, fmt.Sprintf("S-%d-%d", revision, authority))
	for i := 0; i < subAuthorityCount; i++ {
		offset := 8 + 4*i
		sub := binary.LittleEndian.Uint32(b[offset : offset+4])
		parts = append(parts, fmt.Sprintf("%d", sub))
	}

	return strings.Join(parts, "-")
}
