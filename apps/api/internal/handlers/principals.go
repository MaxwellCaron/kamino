package handlers

import (
	"errors"
	"log"
	"net/http"

	activedirectory "github.com/MaxwellCaron/kamino/internal/active_directory"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PrincipalsHandler handles user and group CRUD via Active Directory + local DB.
type PrincipalsHandler struct {
	DB     *pgxpool.Pool
	AD     *activedirectory.Client
	ADSync *activedirectory.Sync
}

// getProviderID returns the principal provider ID, or writes an error response.
func (h *PrincipalsHandler) getProviderID(c *gin.Context) (uuid.UUID, bool) {
	q := database.New(h.DB)
	id, err := q.GetPrincipalProvider(c.Request.Context())
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "no principal provider configured"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get provider"})
		}
		return uuid.Nil, false
	}
	return id, true
}

// ---------- Users ----------

// ListUsers returns all AD user principals from the local database.
// GET /api/v1/principals/users
func (h *PrincipalsHandler) ListUsers(c *gin.Context) {
	providerID, ok := h.getProviderID(c)
	if !ok {
		return
	}

	q := database.New(h.DB)
	users, err := q.GetAllUsers(c.Request.Context(), providerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch users"})
		return
	}
	if users == nil {
		users = []database.GetAllUsersRow{}
	}
	c.JSON(http.StatusOK, users)
}

type createUserRequest struct {
	SAMAccountName string `json:"sam_account_name" binding:"required"`
	DisplayName    string `json:"display_name" binding:"required"`
	OU             string `json:"ou" binding:"required"`
	Password       string `json:"password" binding:"required"`
}

// CreateUser creates a user in AD, then triggers a sync to update the local DB.
// POST /api/v1/principals/users
func (h *PrincipalsHandler) CreateUser(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.AD.CreateUser(req.SAMAccountName, req.DisplayName, req.OU, req.Password); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to create user in AD: " + err.Error()})
		return
	}

	h.syncInBackground(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type updateUserRequest struct {
	DN          string `json:"dn" binding:"required"`
	DisplayName string `json:"display_name" binding:"required"`
}

// UpdateUser updates a user's display name in AD.
// PUT /api/v1/principals/users/:id
func (h *PrincipalsHandler) UpdateUser(c *gin.Context) {
	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.AD.UpdateUser(req.DN, req.DisplayName); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to update user in AD"})
		return
	}

	// Update local DB immediately
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	q := database.New(h.DB)
	providerID, ok := h.getProviderID(c)
	if !ok {
		return
	}
	p, err := q.GetPrincipalByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "principal not found"})
		return
	}

	q.UpsertPrincipal(c.Request.Context(), database.UpsertPrincipalParams{
		ProviderID:    providerID,
		PrincipalType: p.PrincipalType,
		ExternalID:    p.ExternalID,
		Name:          &req.DisplayName,
	})

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type setPasswordRequest struct {
	Password string `json:"password" binding:"required"`
}

// SetPassword sets a user's password in AD.
// POST /api/v1/principals/users/:id/password
func (h *PrincipalsHandler) SetPassword(c *gin.Context) {
	var req setPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	q := database.New(h.DB)
	p, err := q.GetPrincipalByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	dn, err := h.lookupDN(p.ExternalID, "user")
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to look up user in AD"})
		return
	}

	if err := h.AD.SetPassword(dn, req.Password); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to set password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type enableDisableRequest struct {
	DN string `json:"dn" binding:"required"`
}

// EnableUser enables a user account in AD.
// POST /api/v1/principals/users/:id/enable
func (h *PrincipalsHandler) EnableUser(c *gin.Context) {
	var req enableDisableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.AD.EnableUser(req.DN); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to enable user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DisableUser disables a user account in AD.
// POST /api/v1/principals/users/:id/disable
func (h *PrincipalsHandler) DisableUser(c *gin.Context) {
	var req enableDisableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.AD.DisableUser(req.DN); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to disable user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteUser deletes a user from AD and removes the principal from the DB.
// DELETE /api/v1/principals/users/:id
func (h *PrincipalsHandler) DeleteUser(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	ctx := c.Request.Context()
	q := database.New(h.DB)

	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "principal not found"})
		return
	}

	// Look up the DN from AD using the SID
	dn, err := h.lookupDN(p.ExternalID, "user")
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to look up user in AD"})
		return
	}

	if err := h.AD.DeleteUser(dn); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to delete user from AD"})
		return
	}

	q.DeletePrincipal(ctx, id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------- Groups ----------

// ListGroups returns all AD group principals from the local database.
// GET /api/v1/principals/groups
func (h *PrincipalsHandler) ListGroups(c *gin.Context) {
	providerID, ok := h.getProviderID(c)
	if !ok {
		return
	}

	q := database.New(h.DB)
	groups, err := q.GetAllGroups(c.Request.Context(), providerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch groups"})
		return
	}
	if groups == nil {
		groups = []database.GetAllGroupsRow{}
	}
	c.JSON(http.StatusOK, groups)
}

type createGroupRequest struct {
	SAMAccountName string `json:"sam_account_name" binding:"required"`
	DisplayName    string `json:"display_name" binding:"required"`
	OU             string `json:"ou" binding:"required"`
}

// CreateGroup creates a group in AD, then triggers a sync.
// POST /api/v1/principals/groups
func (h *PrincipalsHandler) CreateGroup(c *gin.Context) {
	var req createGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.AD.CreateGroup(req.SAMAccountName, req.DisplayName, req.OU); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to create group in AD: " + err.Error()})
		return
	}

	h.syncInBackground(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type updateGroupRequest struct {
	DN          string `json:"dn" binding:"required"`
	DisplayName string `json:"display_name" binding:"required"`
}

// UpdateGroup updates a group's display name in AD.
// PUT /api/v1/principals/groups/:id
func (h *PrincipalsHandler) UpdateGroup(c *gin.Context) {
	var req updateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.AD.UpdateGroup(req.DN, req.DisplayName); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to update group in AD"})
		return
	}

	// Update local DB
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	q := database.New(h.DB)
	providerID, ok := h.getProviderID(c)
	if !ok {
		return
	}
	p, err := q.GetPrincipalByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "principal not found"})
		return
	}

	q.UpsertPrincipal(c.Request.Context(), database.UpsertPrincipalParams{
		ProviderID:    providerID,
		PrincipalType: p.PrincipalType,
		ExternalID:    p.ExternalID,
		Name:          &req.DisplayName,
	})

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteGroup deletes a group from AD and removes the principal from the DB.
// DELETE /api/v1/principals/groups/:id
func (h *PrincipalsHandler) DeleteGroup(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	ctx := c.Request.Context()
	q := database.New(h.DB)

	p, err := q.GetPrincipalByID(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "principal not found"})
		return
	}

	dn, err := h.lookupDN(p.ExternalID, "group")
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to look up group in AD"})
		return
	}

	if err := h.AD.DeleteGroup(dn); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to delete group from AD"})
		return
	}

	q.DeletePrincipal(ctx, id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------- Group Members ----------

// GetGroupMembers returns the members of a group.
// GET /api/v1/principals/groups/:id/members
func (h *PrincipalsHandler) GetGroupMembers(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	q := database.New(h.DB)
	members, err := q.GetGroupMembers(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch members"})
		return
	}
	if members == nil {
		members = []database.GetGroupMembersRow{}
	}
	c.JSON(http.StatusOK, members)
}

type addMemberRequest struct {
	MemberID string `json:"member_id" binding:"required"`
}

// AddGroupMember adds a member to a group in AD, then updates the local DB.
// POST /api/v1/principals/groups/:id/members
func (h *PrincipalsHandler) AddGroupMember(c *gin.Context) {
	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}

	var req addMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	memberID, err := uuid.Parse(req.MemberID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid member_id"})
		return
	}

	ctx := c.Request.Context()
	q := database.New(h.DB)

	group, err := q.GetPrincipalByID(ctx, groupID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}
	member, err := q.GetPrincipalByID(ctx, memberID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
		return
	}

	groupDN, err := h.lookupDN(group.ExternalID, "group")
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to look up group in AD"})
		return
	}
	memberDN, err := h.lookupDN(member.ExternalID, string(member.PrincipalType))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to look up member in AD"})
		return
	}

	if err := h.AD.AddGroupMember(groupDN, memberDN); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to add member in AD: " + err.Error()})
		return
	}

	h.syncInBackground(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// RemoveGroupMember removes a member from a group in AD, then updates the DB.
// DELETE /api/v1/principals/groups/:id/members/:mid
func (h *PrincipalsHandler) RemoveGroupMember(c *gin.Context) {
	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}

	memberID, err := uuid.Parse(c.Param("mid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid member id"})
		return
	}

	ctx := c.Request.Context()
	q := database.New(h.DB)

	group, err := q.GetPrincipalByID(ctx, groupID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}
	member, err := q.GetPrincipalByID(ctx, memberID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
		return
	}

	groupDN, err := h.lookupDN(group.ExternalID, "group")
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to look up group in AD"})
		return
	}
	memberDN, err := h.lookupDN(member.ExternalID, string(member.PrincipalType))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to look up member in AD"})
		return
	}

	if err := h.AD.RemoveGroupMember(groupDN, memberDN); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to remove member in AD: " + err.Error()})
		return
	}

	h.syncInBackground(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetUserGroups returns the groups a user belongs to.
// GET /api/v1/principals/users/:id/groups
func (h *PrincipalsHandler) GetUserGroups(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	q := database.New(h.DB)
	groups, err := q.GetUserGroups(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch user groups"})
		return
	}
	if groups == nil {
		groups = []database.GetUserGroupsRow{}
	}
	c.JSON(http.StatusOK, groups)
}

// ---------- Sync ----------

// TriggerSync manually triggers a full AD sync.
// POST /api/v1/principals/sync
func (h *PrincipalsHandler) TriggerSync(c *gin.Context) {
	if err := h.ADSync.Run(c.Request.Context()); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AD sync failed: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------- Helpers ----------

// syncInBackground triggers an AD sync in a goroutine so the response isn't blocked.
func (h *PrincipalsHandler) syncInBackground(c *gin.Context) {
	go func() {
		if err := h.ADSync.Run(c.Request.Context()); err != nil {
			log.Printf("Background AD sync failed: %v", err)
		}
	}()
}

// lookupDN finds the Distinguished Name for a principal by searching AD with its SID.
func (h *PrincipalsHandler) lookupDN(sid string, objectType string) (string, error) {
	if objectType == "user" {
		users, err := h.AD.FetchUsers()
		if err != nil {
			return "", err
		}
		for _, u := range users {
			if u.SID == sid {
				return u.DN, nil
			}
		}
	} else {
		groups, err := h.AD.FetchGroups()
		if err != nil {
			return "", err
		}
		for _, g := range groups {
			if g.SID == sid {
				return g.DN, nil
			}
		}
	}
	return "", errors.New("principal not found in AD")
}
