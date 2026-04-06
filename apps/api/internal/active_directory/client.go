package activedirectory

import (
	"crypto/tls"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"

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
	insecure bool
}

// NewClient creates a new LDAP client for Active Directory.
func NewClient(url, bindDN, bindPass, baseDN string, insecure bool) *Client {
	return &Client{
		url:      url,
		bindDN:   bindDN,
		bindPass: bindPass,
		baseDN:   baseDN,
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
	conn, err := c.connect()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	result, err := conn.SearchWithPaging(ldap.NewSearchRequest(
		c.baseDN,
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
