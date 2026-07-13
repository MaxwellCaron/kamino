package activedirectory

import (
	"context"
	"fmt"
	"strings"

	"github.com/go-ldap/ldap/v3"
)

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
