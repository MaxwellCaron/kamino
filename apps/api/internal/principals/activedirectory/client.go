package activedirectory

import (
	"context"
	"crypto/tls"
	"encoding/binary"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/go-ldap/ldap/v3"
)

const (
	adDialTimeout      = 10 * time.Second
	adOperationTimeout = 30 * time.Second
)

var ldapOperationTimeout = adOperationTimeout

// User represents an Active Directory user account.
type User struct {
	DN          string
	SID         string
	Username    string
	FullName    string
	Description string
	CreatedAt   time.Time
	Enabled     bool
}

// Group represents an Active Directory group with its member DNs.
type Group struct {
	DN        string
	SID       string
	Name      string
	MemberDNs []string
	CreatedAt time.Time
}

// Client connects to Active Directory via LDAP.
type Client struct {
	url      string
	bindDN   string
	bindPass string
	baseDN   string
	userOU   string
	groupOU  string
	insecure bool
}

// NewClient creates a new LDAP client for Active Directory.
func NewClient(url, bindDN, bindPass, baseDN, userOU, groupOU string, insecure bool) *Client {
	return &Client{
		url:      url,
		bindDN:   bindDN,
		bindPass: bindPass,
		baseDN:   baseDN,
		userOU:   userOU,
		groupOU:  groupOU,
		insecure: insecure,
	}
}

// connect dials the LDAPS server and binds with the configured credentials.
func (c *Client) connect(ctx context.Context) (*ldap.Conn, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	tlsConn, err := c.dialTLS(ctx)
	if err != nil {
		return nil, err
	}

	conn := ldap.NewConn(tlsConn, true)
	configureLDAPConn(conn)
	conn.Start()

	if err := conn.Bind(c.bindDN, c.bindPass); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ldap bind: %w", err)
	}

	return conn, nil
}

func (c *Client) ldapHost() (string, error) {
	u, err := url.Parse(c.url)
	if err != nil {
		return "", fmt.Errorf("parse ldap url: %w", err)
	}

	host := u.Host
	if !strings.Contains(host, ":") {
		host += ":636"
	}

	return host, nil
}

func (c *Client) dialTLS(ctx context.Context) (net.Conn, error) {
	host, err := c.ldapHost()
	if err != nil {
		return nil, err
	}

	u, err := url.Parse(c.url)
	if err != nil {
		return nil, fmt.Errorf("parse ldap url: %w", err)
	}

	dialer := &tls.Dialer{
		NetDialer: &net.Dialer{Timeout: adDialTimeout},
		Config: &tls.Config{
			InsecureSkipVerify: c.insecure,
			ServerName:         u.Hostname(),
		},
	}

	conn, err := dialer.DialContext(ctx, "tcp", host)
	if err != nil {
		return nil, fmt.Errorf("ldaps dial: %w", err)
	}

	return conn, nil
}

func configureLDAPConn(conn *ldap.Conn) {
	conn.SetTimeout(ldapOperationTimeout)
}

// AuthResult holds the identity of a successfully authenticated AD user.
type AuthResult struct {
	DN       string
	SID      string
	Username string
}

func parseADWhenCreated(value string) (time.Time, error) {
	createdAt, err := time.Parse("20060102150405.0Z", value)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse AD whenCreated %q: %w", value, err)
	}
	return createdAt.UTC(), nil
}

func parseUserAccountControl(value string) bool {
	uac, err := strconv.Atoi(value)
	return err != nil || (uac&2) == 0
}

func userFromEntry(entry *ldap.Entry) (User, error) {
	sid := decodeSID(entry.GetRawAttributeValue("objectSid"))
	if sid == "" {
		return User{}, fmt.Errorf("ad: could not decode user SID")
	}

	createdAt, err := parseADWhenCreated(entry.GetAttributeValue("whenCreated"))
	if err != nil {
		return User{}, err
	}

	return User{
		DN:          entry.GetAttributeValue("distinguishedName"),
		SID:         sid,
		Username:    entry.GetAttributeValue("sAMAccountName"),
		FullName:    entry.GetAttributeValue("displayName"),
		Description: entry.GetAttributeValue("description"),
		CreatedAt:   createdAt,
		Enabled:     parseUserAccountControl(entry.GetAttributeValue("userAccountControl")),
	}, nil
}

func groupFromEntry(entry *ldap.Entry) (Group, error) {
	sid := decodeSID(entry.GetRawAttributeValue("objectSid"))
	if sid == "" {
		return Group{}, fmt.Errorf("ad: could not decode group SID")
	}

	name := entry.GetAttributeValue("displayName")
	if name == "" {
		name = entry.GetAttributeValue("sAMAccountName")
	}

	createdAt, err := parseADWhenCreated(entry.GetAttributeValue("whenCreated"))
	if err != nil {
		return Group{}, err
	}

	return Group{
		DN:        entry.GetAttributeValue("distinguishedName"),
		SID:       sid,
		Name:      name,
		MemberDNs: entry.GetAttributeValues("member"),
		CreatedAt: createdAt,
	}, nil
}

func (c *Client) bindUser(ctx context.Context, userDN, password string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	tlsConn, err := c.dialTLS(ctx)
	if err != nil {
		return err
	}
	userConn := ldap.NewConn(tlsConn, true)
	configureLDAPConn(userConn)
	userConn.Start()
	defer userConn.Close()

	if err := userConn.Bind(userDN, password); err != nil {
		return fmt.Errorf("invalid credentials")
	}

	return nil
}

func (c *Client) Authenticate(ctx context.Context, username, password string) (*AuthResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	// First, connect with service account to look up the user's DN and SID.
	conn, err := c.connect(ctx)
	if err != nil {
		return nil, fmt.Errorf("ad connect: %w", err)
	}
	defer conn.Close()

	filter := fmt.Sprintf("(&(objectClass=user)(objectCategory=person)(sAMAccountName=%s))", ldap.EscapeFilter(username))
	result, err := conn.Search(ldap.NewSearchRequest(
		c.baseDN,
		ldap.ScopeWholeSubtree,
		ldap.NeverDerefAliases, 1, 0, false,
		filter,
		[]string{"objectSid", "sAMAccountName", "displayName", "description", "distinguishedName", "whenCreated", "userAccountControl"},
		nil,
	))
	if err != nil {
		return nil, fmt.Errorf("ad search user: %w", err)
	}
	if len(result.Entries) == 0 {
		return nil, fmt.Errorf("invalid credentials")
	}

	entry := result.Entries[0]
	user, err := userFromEntry(entry)
	if err != nil {
		return nil, err
	}

	// Now attempt a fresh bind as the user to verify their password.
	if err := c.bindUser(ctx, user.DN, password); err != nil {
		return nil, err
	}

	return &AuthResult{DN: user.DN, SID: user.SID, Username: user.Username}, nil
}

func (c *Client) AuthenticateDN(ctx context.Context, userDN, password string) error {
	return c.bindUser(ctx, userDN, password)
}

func allUsersFilter() string {
	return "(&(objectClass=user)(objectCategory=person))"
}

// FetchUsers returns all user accounts under the configured base DN.
func (c *Client) FetchUsers(ctx context.Context) ([]User, error) {
	conn, err := c.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	filter := allUsersFilter()

	result, err := conn.SearchWithPaging(ldap.NewSearchRequest(
		c.baseDN,
		ldap.ScopeWholeSubtree,
		ldap.NeverDerefAliases, 0, 0, false,
		filter,
		[]string{"objectSid", "sAMAccountName", "displayName", "description", "distinguishedName", "whenCreated", "userAccountControl"},
		nil,
	), 1000)
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

// FetchGroups returns all groups under the configured base DN.
func (c *Client) FetchGroups(ctx context.Context) ([]Group, error) {
	return c.fetchGroups(ctx, c.baseDN)
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

	result, err := conn.SearchWithPaging(ldap.NewSearchRequest(
		searchBase,
		ldap.ScopeWholeSubtree,
		ldap.NeverDerefAliases, 0, 0, false,
		"(objectClass=group)",
		[]string{"objectSid", "sAMAccountName", "displayName", "distinguishedName", "member", "whenCreated"},
		nil,
	), 1000)
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

// encodePassword converts a plaintext password to the UTF-16LE encoding
// required by Active Directory's unicodePwd attribute.
func encodePassword(password string) []byte {
	quoted := "\"" + password + "\""
	encoded := utf16.Encode([]rune(quoted))
	buf := make([]byte, len(encoded)*2)
	for i, v := range encoded {
		binary.LittleEndian.PutUint16(buf[i*2:], v)
	}
	return buf
}

// CreateUser creates a new user account in Active Directory.
func (c *Client) CreateUser(ctx context.Context, username, password, description string) (User, error) {
	conn, err := c.connect(ctx)
	if err != nil {
		return User{}, err
	}
	defer conn.Close()

	dn := fmt.Sprintf("CN=%s,%s", ldap.EscapeDN(username), c.userOU)

	addReq := ldap.NewAddRequest(dn, nil)
	addReq.Attribute("objectClass", []string{"top", "person", "organizationalPerson", "user"})
	addReq.Attribute("sAMAccountName", []string{username})
	addReq.Attribute("userPrincipalName", []string{username + "@" + c.domainFromBaseDN()})
	addReq.Attribute("unicodePwd", []string{string(encodePassword(password))})
	// 512 = NORMAL_ACCOUNT (enabled)
	addReq.Attribute("userAccountControl", []string{"512"})
	if description != "" {
		addReq.Attribute("description", []string{description})
	}

	if err := conn.Add(addReq); err != nil {
		return User{}, fmt.Errorf("ldap create user: %w", err)
	}

	user, err := c.fetchUserByDN(conn, dn)
	if err != nil {
		return User{}, err
	}
	if user == nil {
		return User{}, fmt.Errorf("ldap create user: created user %q could not be reloaded", username)
	}

	return *user, nil
}

// UpdateUser modifies the logon name and profile metadata of an existing user.
func (c *Client) UpdateUser(ctx context.Context, dn, username, fullName, description string) error {
	conn, err := c.connect(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	modReq := ldap.NewModifyRequest(dn, nil)
	modReq.Replace("sAMAccountName", []string{username})
	modReq.Replace("userPrincipalName", []string{username + "@" + c.domainFromBaseDN()})
	if fullName != "" {
		modReq.Replace("displayName", []string{fullName})
	} else {
		modReq.Delete("displayName", nil)
	}
	if description != "" {
		modReq.Replace("description", []string{description})
	} else {
		modReq.Delete("description", nil)
	}

	if err := conn.Modify(modReq); err != nil {
		return fmt.Errorf("ldap update user: %w", err)
	}
	return nil
}

// SetPassword sets the password for an existing user account.
func (c *Client) SetPassword(ctx context.Context, dn, password string) error {
	conn, err := c.connect(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	modReq := ldap.NewModifyRequest(dn, nil)
	modReq.Replace("unicodePwd", []string{string(encodePassword(password))})

	if err := conn.Modify(modReq); err != nil {
		return fmt.Errorf("ldap set password: %w", err)
	}
	return nil
}

// EnableUser enables a user account by setting userAccountControl to NORMAL_ACCOUNT.
func (c *Client) EnableUser(ctx context.Context, dn string) error {
	conn, err := c.connect(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	modReq := ldap.NewModifyRequest(dn, nil)
	modReq.Replace("userAccountControl", []string{"512"})

	if err := conn.Modify(modReq); err != nil {
		return fmt.Errorf("ldap enable user: %w", err)
	}
	return nil
}

// DisableUser disables a user account by setting the ACCOUNTDISABLE flag.
func (c *Client) DisableUser(ctx context.Context, dn string) error {
	conn, err := c.connect(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	modReq := ldap.NewModifyRequest(dn, nil)
	// 514 = NORMAL_ACCOUNT | ACCOUNTDISABLE
	modReq.Replace("userAccountControl", []string{"514"})

	if err := conn.Modify(modReq); err != nil {
		return fmt.Errorf("ldap disable user: %w", err)
	}
	return nil
}

// DeleteUser deletes a user account from Active Directory.
func (c *Client) DeleteUser(ctx context.Context, dn string) error {
	conn, err := c.connect(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	if err := conn.Del(ldap.NewDelRequest(dn, nil)); err != nil {
		return fmt.Errorf("ldap delete user: %w", err)
	}
	return nil
}

// CreateGroup creates a new security group in Active Directory.
func (c *Client) CreateGroup(ctx context.Context, name string) (Group, error) {
	conn, err := c.connect(ctx)
	if err != nil {
		return Group{}, err
	}
	defer conn.Close()

	dn := fmt.Sprintf("CN=%s,%s", ldap.EscapeDN(name), c.groupOU)

	addReq := ldap.NewAddRequest(dn, nil)
	addReq.Attribute("objectClass", []string{"top", "group"})
	addReq.Attribute("sAMAccountName", []string{name})
	addReq.Attribute("displayName", []string{name})
	// -2147483646 = Global security group
	addReq.Attribute("groupType", []string{"-2147483646"})

	if err := conn.Add(addReq); err != nil {
		return Group{}, fmt.Errorf("ldap create group: %w", err)
	}

	group, err := c.fetchGroupByDN(conn, dn)
	if err != nil {
		return Group{}, err
	}
	if group == nil {
		return Group{}, fmt.Errorf("ldap create group: created group %q could not be reloaded", name)
	}

	return *group, nil
}

// UpdateGroup modifies the display name of an existing group.
func (c *Client) UpdateGroup(ctx context.Context, dn, name string) error {
	conn, err := c.connect(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	modReq := ldap.NewModifyRequest(dn, nil)
	modReq.Replace("displayName", []string{name})

	if err := conn.Modify(modReq); err != nil {
		return fmt.Errorf("ldap update group: %w", err)
	}
	return nil
}

// DeleteGroup deletes a group from Active Directory.
func (c *Client) DeleteGroup(ctx context.Context, dn string) error {
	conn, err := c.connect(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	if err := conn.Del(ldap.NewDelRequest(dn, nil)); err != nil {
		return fmt.Errorf("ldap delete group: %w", err)
	}
	return nil
}

// AddGroupMember adds a member to an AD group.
func (c *Client) AddGroupMember(ctx context.Context, groupDN, memberDN string) error {
	conn, err := c.connect(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	modReq := ldap.NewModifyRequest(groupDN, nil)
	modReq.Add("member", []string{memberDN})

	if err := conn.Modify(modReq); err != nil {
		return fmt.Errorf("ldap add group member: %w", err)
	}
	return nil
}

// RemoveGroupMember removes a member from an AD group.
func (c *Client) RemoveGroupMember(ctx context.Context, groupDN, memberDN string) error {
	conn, err := c.connect(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	modReq := ldap.NewModifyRequest(groupDN, nil)
	modReq.Delete("member", []string{memberDN})

	if err := conn.Modify(modReq); err != nil {
		return fmt.Errorf("ldap remove group member: %w", err)
	}
	return nil
}

// domainFromBaseDN extracts a DNS domain name from the base DN.
// e.g. "DC=corp,DC=example,DC=com" → "corp.example.com"
func (c *Client) domainFromBaseDN() string {
	parts := strings.Split(c.baseDN, ",")
	var domains []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if strings.HasPrefix(strings.ToUpper(p), "DC=") {
			domains = append(domains, p[3:])
		}
	}
	return strings.Join(domains, ".")
}

// BaseDN returns the configured search base DN.
func (c *Client) BaseDN() string {
	return c.baseDN
}
