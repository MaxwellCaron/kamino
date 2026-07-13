package activedirectory

import (
	"context"
	"encoding/binary"
	"fmt"
	"unicode/utf16"

	"github.com/go-ldap/ldap/v3"
)

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
