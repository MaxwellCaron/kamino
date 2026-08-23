package activedirectory

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

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
