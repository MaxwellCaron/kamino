package activedirectory

import (
	"crypto/tls"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"unicode/utf16"

	"github.com/go-ldap/ldap/v3"
)

// User represents an Active Directory user account.
type User struct {
	DN   string
	SID  string
	Name string
}

// Group represents an Active Directory group with its member DNs.
type Group struct {
	DN        string
	SID       string
	Name      string
	MemberDNs []string
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
func (c *Client) connect() (*ldap.Conn, error) {
	u, err := url.Parse(c.url)
	if err != nil {
		return nil, fmt.Errorf("parse ldap url: %w", err)
	}

	host := u.Host
	if !strings.Contains(host, ":") {
		host += ":636"
	}

	tlsConn, err := tls.Dial("tcp", host, &tls.Config{
		InsecureSkipVerify: c.insecure,
		ServerName:         u.Hostname(),
	})
	if err != nil {
		return nil, fmt.Errorf("ldaps dial: %w", err)
	}

	conn := ldap.NewConn(tlsConn, true)
	conn.Start()

	if err := conn.Bind(c.bindDN, c.bindPass); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ldap bind: %w", err)
	}

	return conn, nil
}

// AuthResult holds the identity of a successfully authenticated AD user.
type AuthResult struct {
	DN   string
	SID  string
	Name string
}

func (c *Client) Authenticate(username, password string) (*AuthResult, error) {
	// First, connect with service account to look up the user's DN and SID.
	conn, err := c.connect()
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
		[]string{"objectSid", "sAMAccountName", "displayName", "distinguishedName"},
		nil,
	))
	if err != nil {
		return nil, fmt.Errorf("ad search user: %w", err)
	}
	if len(result.Entries) == 0 {
		return nil, fmt.Errorf("invalid credentials")
	}

	entry := result.Entries[0]
	userDN := entry.GetAttributeValue("distinguishedName")
	sid := decodeSID(entry.GetRawAttributeValue("objectSid"))
	if sid == "" {
		return nil, fmt.Errorf("ad: could not decode user SID")
	}

	name := entry.GetAttributeValue("displayName")
	if name == "" {
		name = entry.GetAttributeValue("sAMAccountName")
	}

	// Now attempt a fresh bind as the user to verify their password.
	conn.Close()
	u, err := url.Parse(c.url)
	if err != nil {
		return nil, fmt.Errorf("parse ldap url: %w", err)
	}
	host := u.Host
	if !strings.Contains(host, ":") {
		host += ":636"
	}
	tlsConn, err := tls.Dial("tcp", host, &tls.Config{
		InsecureSkipVerify: c.insecure,
		ServerName:         u.Hostname(),
	})
	if err != nil {
		return nil, fmt.Errorf("ldaps dial: %w", err)
	}
	userConn := ldap.NewConn(tlsConn, true)
	userConn.Start()
	defer userConn.Close()

	if err := userConn.Bind(userDN, password); err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	return &AuthResult{DN: userDN, SID: sid, Name: name}, nil
}

// FetchUsers returns all enabled user accounts under the configured base DN.
func (c *Client) FetchUsers() ([]User, error) {
	conn, err := c.connect()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// Filter: person objects that are not disabled (bit 2 of userAccountControl)
	filter := "(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"

	result, err := conn.SearchWithPaging(ldap.NewSearchRequest(
		c.baseDN,
		ldap.ScopeWholeSubtree,
		ldap.NeverDerefAliases, 0, 0, false,
		filter,
		[]string{"objectSid", "sAMAccountName", "displayName", "distinguishedName"},
		nil,
	), 1000)
	if err != nil {
		return nil, fmt.Errorf("ldap search users: %w", err)
	}

	users := make([]User, 0, len(result.Entries))
	for _, entry := range result.Entries {
		sid := decodeSID(entry.GetRawAttributeValue("objectSid"))
		if sid == "" {
			continue
		}

		name := entry.GetAttributeValue("displayName")
		if name == "" {
			name = entry.GetAttributeValue("sAMAccountName")
		}

		users = append(users, User{
			DN:   entry.GetAttributeValue("distinguishedName"),
			SID:  sid,
			Name: name,
		})
	}

	return users, nil
}

// FetchGroups returns all groups under the configured base DN.
func (c *Client) FetchGroups() ([]Group, error) {
	return c.fetchGroups(c.baseDN)
}

// FetchGroupByDN returns a single group for an exact distinguished name.
func (c *Client) FetchGroupByDN(groupDN string) (*Group, error) {
	conn, err := c.connect()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	searchDN := strings.TrimSpace(groupDN)
	if searchDN == "" {
		return nil, fmt.Errorf("group DN is required")
	}

	result, err := conn.Search(ldap.NewSearchRequest(
		searchDN,
		ldap.ScopeBaseObject,
		ldap.NeverDerefAliases, 1, 0, false,
		"(objectClass=group)",
		[]string{"objectSid", "sAMAccountName", "displayName", "distinguishedName", "member"},
		nil,
	))
	if err != nil {
		return nil, fmt.Errorf("ldap search group by dn: %w", err)
	}
	if len(result.Entries) == 0 {
		return nil, nil
	}

	entry := result.Entries[0]
	sid := decodeSID(entry.GetRawAttributeValue("objectSid"))
	if sid == "" {
		return nil, fmt.Errorf("ad: could not decode group SID")
	}

	name := entry.GetAttributeValue("displayName")
	if name == "" {
		name = entry.GetAttributeValue("sAMAccountName")
	}

	return &Group{
		DN:        entry.GetAttributeValue("distinguishedName"),
		SID:       sid,
		Name:      name,
		MemberDNs: entry.GetAttributeValues("member"),
	}, nil
}

// FetchGroupsInDN returns groups under a specific DN subtree.
func (c *Client) FetchGroupsInDN(baseDN string) ([]Group, error) {
	return c.fetchGroups(baseDN)
}

func (c *Client) fetchGroups(baseDN string) ([]Group, error) {
	conn, err := c.connect()
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
		[]string{"objectSid", "sAMAccountName", "displayName", "distinguishedName", "member"},
		nil,
	), 1000)
	if err != nil {
		return nil, fmt.Errorf("ldap search groups: %w", err)
	}

	groups := make([]Group, 0, len(result.Entries))
	for _, entry := range result.Entries {
		sid := decodeSID(entry.GetRawAttributeValue("objectSid"))
		if sid == "" {
			continue
		}

		name := entry.GetAttributeValue("displayName")
		if name == "" {
			name = entry.GetAttributeValue("sAMAccountName")
		}

		groups = append(groups, Group{
			DN:        entry.GetAttributeValue("distinguishedName"),
			SID:       sid,
			Name:      name,
			MemberDNs: entry.GetAttributeValues("member"),
		})
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
func (c *Client) CreateUser(username, password string) error {
	conn, err := c.connect()
	if err != nil {
		return err
	}
	defer conn.Close()

	dn := fmt.Sprintf("CN=%s,%s", ldap.EscapeFilter(username), c.userOU)

	addReq := ldap.NewAddRequest(dn, nil)
	addReq.Attribute("objectClass", []string{"top", "person", "organizationalPerson", "user"})
	addReq.Attribute("sAMAccountName", []string{username})
	addReq.Attribute("displayName", []string{username})
	addReq.Attribute("userPrincipalName", []string{username + "@" + c.domainFromBaseDN()})
	addReq.Attribute("unicodePwd", []string{string(encodePassword(password))})
	// 512 = NORMAL_ACCOUNT (enabled)
	addReq.Attribute("userAccountControl", []string{"512"})

	if err := conn.Add(addReq); err != nil {
		return fmt.Errorf("ldap create user: %w", err)
	}
	return nil
}

// UpdateUser modifies the display name of an existing user.
func (c *Client) UpdateUser(dn, username string) error {
	conn, err := c.connect()
	if err != nil {
		return err
	}
	defer conn.Close()

	modReq := ldap.NewModifyRequest(dn, nil)
	modReq.Replace("displayName", []string{username})

	if err := conn.Modify(modReq); err != nil {
		return fmt.Errorf("ldap update user: %w", err)
	}
	return nil
}

// SetPassword sets the password for an existing user account.
func (c *Client) SetPassword(dn, password string) error {
	conn, err := c.connect()
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
func (c *Client) EnableUser(dn string) error {
	conn, err := c.connect()
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
func (c *Client) DisableUser(dn string) error {
	conn, err := c.connect()
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
func (c *Client) DeleteUser(dn string) error {
	conn, err := c.connect()
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
func (c *Client) CreateGroup(name string) error {
	conn, err := c.connect()
	if err != nil {
		return err
	}
	defer conn.Close()

	dn := fmt.Sprintf("CN=%s,%s", ldap.EscapeFilter(name), c.groupOU)

	addReq := ldap.NewAddRequest(dn, nil)
	addReq.Attribute("objectClass", []string{"top", "group"})
	addReq.Attribute("sAMAccountName", []string{name})
	addReq.Attribute("displayName", []string{name})
	// -2147483646 = Global security group
	addReq.Attribute("groupType", []string{"-2147483646"})

	if err := conn.Add(addReq); err != nil {
		return fmt.Errorf("ldap create group: %w", err)
	}
	return nil
}

// UpdateGroup modifies the display name of an existing group.
func (c *Client) UpdateGroup(dn, name string) error {
	conn, err := c.connect()
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
func (c *Client) DeleteGroup(dn string) error {
	conn, err := c.connect()
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
func (c *Client) AddGroupMember(groupDN, memberDN string) error {
	conn, err := c.connect()
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
func (c *Client) RemoveGroupMember(groupDN, memberDN string) error {
	conn, err := c.connect()
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
