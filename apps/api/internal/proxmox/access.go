package proxmox

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/principals"
)

// TicketAuthResult holds the authenticated Proxmox user identity.
type TicketAuthResult struct {
	UserID string
}

// AccessUser is a Proxmox access-management user entry.
type AccessUser struct {
	UserID    string `json:"userid"`
	Comment   string `json:"comment"`
	Email     string `json:"email"`
	Enable    int    `json:"enable"`
	Expire    int    `json:"expire"`
	FirstName string `json:"firstname"`
	LastName  string `json:"lastname"`
	Groups    string `json:"groups"`
}

// AccessGroup is a Proxmox access-management group entry.
type AccessGroup struct {
	GroupID string `json:"groupid"`
	Comment string `json:"comment"`
	Users   string `json:"users"`
}

type ticketAuthResponse struct {
	Username string `json:"username"`
}

func normalizeProxmoxUserID(username, defaultRealm string) string {
	username = strings.TrimSpace(username)
	defaultRealm = strings.TrimSpace(defaultRealm)
	if username == "" {
		return ""
	}
	if strings.Contains(username, "@") {
		return username
	}
	if defaultRealm == "" {
		return username
	}
	return username + "@" + defaultRealm
}

// ParseAccessGroups splits a Proxmox comma-separated group list.
func ParseAccessGroups(raw string) []string {
	return parseAccessCSV(raw)
}

// ParseAccessUsers splits a Proxmox comma-separated user list.
func ParseAccessUsers(raw string) []string {
	return parseAccessCSV(raw)
}

func parseAccessCSV(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	values := make([]string, 0)
	for _, value := range strings.Split(raw, ",") {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		values = append(values, value)
	}
	return values
}

func accessUserPath(userid string) string {
	return "/api2/json/access/users/" + url.PathEscape(userid)
}

func accessGroupPath(groupid string) string {
	return "/api2/json/access/groups/" + url.PathEscape(groupid)
}

func (c *Client) postFormUnauthenticated(
	ctx context.Context,
	path string,
	form url.Values,
	result any,
) error {
	if form == nil {
		form = url.Values{}
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+path,
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return principals.ErrInvalidCredentials
	}
	if resp.StatusCode != http.StatusOK {
		return unexpectedStatusError(resp, path)
	}

	if result != nil {
		if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
			return fmt.Errorf("decoding response: %w", err)
		}
	} else {
		_, _ = io.Copy(io.Discard, resp.Body)
	}
	return nil
}

// AuthenticateTicket verifies credentials through Proxmox /access/ticket.
func (c *Client) AuthenticateTicket(
	ctx context.Context,
	username, password, defaultRealm string,
) (TicketAuthResult, error) {
	userid := normalizeProxmoxUserID(username, defaultRealm)
	if userid == "" {
		return TicketAuthResult{}, principals.ErrInvalidCredentials
	}

	form := url.Values{}
	form.Set("username", userid)
	form.Set("password", password)

	var resp apiResponse[ticketAuthResponse]
	if err := c.postFormUnauthenticated(ctx, "/api2/json/access/ticket", form, &resp); err != nil {
		if errors.Is(err, principals.ErrInvalidCredentials) {
			return TicketAuthResult{}, principals.ErrInvalidCredentials
		}
		return TicketAuthResult{}, fmt.Errorf("authenticate ticket: %w", err)
	}

	authenticatedUserID := strings.TrimSpace(resp.Data.Username)
	if authenticatedUserID == "" {
		authenticatedUserID = userid
	}

	return TicketAuthResult{UserID: authenticatedUserID}, nil
}

// ListAccessUsers returns all Proxmox access users.
func (c *Client) ListAccessUsers(ctx context.Context) ([]AccessUser, error) {
	var resp apiResponse[[]AccessUser]
	if err := c.get(ctx, "/api2/json/access/users", &resp); err != nil {
		return nil, fmt.Errorf("list access users: %w", err)
	}
	return resp.Data, nil
}

// ListAccessGroups returns all Proxmox access groups.
func (c *Client) ListAccessGroups(ctx context.Context) ([]AccessGroup, error) {
	var resp apiResponse[[]AccessGroup]
	if err := c.get(ctx, "/api2/json/access/groups", &resp); err != nil {
		return nil, fmt.Errorf("list access groups: %w", err)
	}
	return resp.Data, nil
}

// CreateAccessUser creates a Proxmox access user.
func (c *Client) CreateAccessUser(ctx context.Context, userid, comment string, enabled bool) error {
	form := map[string]string{
		"userid": userid,
	}
	if comment != "" {
		form["comment"] = comment
	}
	if !enabled {
		form["enable"] = "0"
	}

	var resp apiResponse[any]
	if err := c.post(ctx, "/api2/json/access/users", form, &resp); err != nil {
		return fmt.Errorf("create access user: %w", err)
	}
	return nil
}

// UpdateAccessUser updates a Proxmox access user.
func (c *Client) UpdateAccessUser(
	ctx context.Context,
	userid, comment string,
	enabled *bool,
	groups []string,
) error {
	form := map[string]string{}
	if comment != "" {
		form["comment"] = comment
	}
	if enabled != nil {
		if *enabled {
			form["enable"] = "1"
		} else {
			form["enable"] = "0"
		}
	}
	if groups != nil {
		form["groups"] = strings.Join(groups, ",")
	}

	return c.put(ctx, accessUserPath(userid), form, nil)
}

// DeleteAccessUser deletes a Proxmox access user.
func (c *Client) DeleteAccessUser(ctx context.Context, userid string) error {
	var resp apiResponse[any]
	if err := c.delete(ctx, accessUserPath(userid), &resp); err != nil {
		return fmt.Errorf("delete access user: %w", err)
	}
	return nil
}

// CreateAccessGroup creates a Proxmox access group.
func (c *Client) CreateAccessGroup(ctx context.Context, groupid, comment string) error {
	form := map[string]string{
		"groupid": groupid,
	}
	if comment != "" {
		form["comment"] = comment
	}

	var resp apiResponse[any]
	if err := c.post(ctx, "/api2/json/access/groups", form, &resp); err != nil {
		return fmt.Errorf("create access group: %w", err)
	}
	return nil
}

// UpdateAccessGroup updates a Proxmox access group.
func (c *Client) UpdateAccessGroup(ctx context.Context, groupid, comment string) error {
	form := map[string]string{}
	if comment != "" {
		form["comment"] = comment
	}

	return c.put(ctx, accessGroupPath(groupid), form, nil)
}

// DeleteAccessGroup deletes a Proxmox access group.
func (c *Client) DeleteAccessGroup(ctx context.Context, groupid string) error {
	var resp apiResponse[any]
	if err := c.delete(ctx, accessGroupPath(groupid), &resp); err != nil {
		return fmt.Errorf("delete access group: %w", err)
	}
	return nil
}
