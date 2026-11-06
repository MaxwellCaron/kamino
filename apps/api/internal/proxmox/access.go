package proxmox

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

var ErrInvalidCredentials = errors.New("invalid credentials")

type TicketAuthResult struct {
	UserID string
}

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

func ParseAccessGroups(raw string) []string {
	return parseAccessCSV(raw)
}

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

// AuthenticateTicket verifies credentials through Proxmox /access/ticket.
func (c *Client) AuthenticateTicket(
	ctx context.Context,
	username, password, defaultRealm string,
) (TicketAuthResult, error) {
	userid := normalizeProxmoxUserID(username, defaultRealm)
	if userid == "" {
		return TicketAuthResult{}, ErrInvalidCredentials
	}

	form := url.Values{}
	form.Set("username", userid)
	form.Set("password", password)

	req, err := c.newRequest(ctx, http.MethodPost, "/api2/json/access/ticket", form)
	if err != nil {
		return TicketAuthResult{}, fmt.Errorf("authenticate ticket: %w", err)
	}
	var resp apiResponse[ticketAuthResponse]
	if err := c.do(req, &resp); err != nil {
		var statusErr *apiStatusError
		if errors.As(err, &statusErr) && (statusErr.statusCode == http.StatusUnauthorized || statusErr.statusCode == http.StatusForbidden) {
			return TicketAuthResult{}, ErrInvalidCredentials
		}
		return TicketAuthResult{}, fmt.Errorf("authenticate ticket: %w", err)
	}

	authenticatedUserID := strings.TrimSpace(resp.Data.Username)
	if authenticatedUserID == "" {
		authenticatedUserID = userid
	}

	return TicketAuthResult{UserID: authenticatedUserID}, nil
}

func (c *Client) ListAccessUsers(ctx context.Context) ([]AccessUser, error) {
	var resp apiResponse[[]AccessUser]
	if err := c.get(ctx, "/api2/json/access/users?full=1", &resp); err != nil {
		return nil, fmt.Errorf("list access users: %w", err)
	}
	return resp.Data, nil
}

func (c *Client) ListAccessGroups(ctx context.Context) ([]AccessGroup, error) {
	var resp apiResponse[[]AccessGroup]
	if err := c.get(ctx, "/api2/json/access/groups", &resp); err != nil {
		return nil, fmt.Errorf("list access groups: %w", err)
	}
	return resp.Data, nil
}

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

func (c *Client) UpdateAccessUser(
	ctx context.Context,
	userid, comment string,
	enabled *bool,
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
	return c.put(ctx, accessUserPath(userid), form, nil)
}

// AddAccessUserGroups adds groups without replacing existing memberships.
func (c *Client) AddAccessUserGroups(ctx context.Context, userid string, groups []string) error {
	return c.updateAccessUserGroups(ctx, userid, groups, true)
}

// SetAccessUserGroups replaces the user's complete group membership list.
func (c *Client) SetAccessUserGroups(ctx context.Context, userid string, groups []string) error {
	return c.updateAccessUserGroups(ctx, userid, groups, false)
}

func (c *Client) updateAccessUserGroups(
	ctx context.Context,
	userid string,
	groups []string,
	appendGroups bool,
) error {
	form := map[string]string{"groups": strings.Join(groups, ",")}
	if appendGroups {
		form["append"] = "1"
	}
	return c.put(ctx, accessUserPath(userid), form, nil)
}

func (c *Client) DeleteAccessUser(ctx context.Context, userid string) error {
	var resp apiResponse[any]
	if err := c.delete(ctx, accessUserPath(userid), &resp); err != nil {
		return fmt.Errorf("delete access user: %w", err)
	}
	return nil
}

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

func (c *Client) UpdateAccessGroup(ctx context.Context, groupid, comment string) error {
	form := map[string]string{}
	if comment != "" {
		form["comment"] = comment
	}

	return c.put(ctx, accessGroupPath(groupid), form, nil)
}

func (c *Client) DeleteAccessGroup(ctx context.Context, groupid string) error {
	var resp apiResponse[any]
	if err := c.delete(ctx, accessGroupPath(groupid), &resp); err != nil {
		return fmt.Errorf("delete access group: %w", err)
	}
	return nil
}
