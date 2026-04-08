package handlers

import (
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// PrincipalsHandler handles user and group CRUD via a generic principal provider.
type PrincipalsHandler struct {
	Provider principals.Provider
}

type bulkDeleteRequest struct {
	IDs []string `json:"ids" binding:"required,min=1"`
}

type bulkDeleteFailure struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

type bulkDeleteResponse struct {
	Deleted []string            `json:"deleted"`
	Failed  []bulkDeleteFailure `json:"failed"`
}

type bulkMembershipRequest struct {
	MemberIDs []string `json:"member_ids" binding:"required,min=1"`
}

type bulkMembershipFailure struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

type bulkMembershipResponse struct {
	Succeeded []string                `json:"succeeded"`
	Failed    []bulkMembershipFailure `json:"failed"`
}

func parseBulkDeleteIDs(c *gin.Context) ([]string, bool) {
	var req bulkDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, false
	}

	for _, rawID := range req.IDs {
		if _, err := uuid.Parse(rawID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return nil, false
		}
	}

	return req.IDs, true
}

func writeBulkDeleteResponse(
	c *gin.Context,
	rawIDs []string,
	deleteFn func(uuid.UUID) error,
) {
	response := bulkDeleteResponse{
		Deleted: make([]string, 0, len(rawIDs)),
		Failed:  make([]bulkDeleteFailure, 0),
	}

	for i, rawID := range rawIDs {
		id, err := uuid.Parse(rawID)
		if err != nil {
			response.Failed = append(response.Failed, bulkDeleteFailure{
				ID:    rawID,
				Error: "invalid id",
			})
			continue
		}

		if err := deleteFn(id); err != nil {
			response.Failed = append(response.Failed, bulkDeleteFailure{
				ID:    rawID,
				Error: err.Error(),
			})
			continue
		}

		response.Deleted = append(response.Deleted, rawIDs[i])
	}

	c.JSON(http.StatusOK, response)
}

func parseBulkMembershipIDs(c *gin.Context) ([]uuid.UUID, []string, bool) {
	var req bulkMembershipRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, nil, false
	}

	memberIDs := make([]uuid.UUID, 0, len(req.MemberIDs))
	for _, rawID := range req.MemberIDs {
		id, err := uuid.Parse(rawID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid member id"})
			return nil, nil, false
		}
		memberIDs = append(memberIDs, id)
	}

	return memberIDs, req.MemberIDs, true
}

// ---------- Users ----------

// ListUsers returns all user principals.
// GET /api/v1/principals/users
func (h *PrincipalsHandler) ListUsers(c *gin.Context) {
	users, err := h.Provider.ListUsers(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch users"})
		return
	}
	if users == nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	c.JSON(http.StatusOK, users)
}

type createUserRequest struct {
	Username    string `json:"username" binding:"required"`
	Description string `json:"description"`
	Password    string `json:"password" binding:"required"`
}

// CreateUser creates a new user.
// POST /api/v1/principals/users
func (h *PrincipalsHandler) CreateUser(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.Provider.CreateUser(c.Request.Context(), req.Username, req.Password, req.Description); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to create user: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type updateUserRequest struct {
	Username    string `json:"username" binding:"required"`
	Description string `json:"description"`
}

// UpdateUser updates a user's name.
// PUT /api/v1/principals/users/:id
func (h *PrincipalsHandler) UpdateUser(c *gin.Context) {
	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.Provider.UpdateUser(c.Request.Context(), id, req.Username, req.Description); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to update user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type setPasswordRequest struct {
	Password string `json:"password" binding:"required"`
}

// SetPassword sets a user's password.
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

	if err := h.Provider.SetPassword(c.Request.Context(), id, req.Password); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to set password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// EnableUser enables a user account.
// POST /api/v1/principals/users/:id/enable
func (h *PrincipalsHandler) EnableUser(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.Provider.EnableUser(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to enable user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DisableUser disables a user account.
// POST /api/v1/principals/users/:id/disable
func (h *PrincipalsHandler) DisableUser(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.Provider.DisableUser(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to disable user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteUsers deletes multiple users.
// DELETE /api/v1/principals/users
func (h *PrincipalsHandler) DeleteUsers(c *gin.Context) {
	rawIDs, ok := parseBulkDeleteIDs(c)
	if !ok {
		return
	}

	writeBulkDeleteResponse(c, rawIDs, func(id uuid.UUID) error {
		return h.Provider.DeleteUser(c.Request.Context(), id)
	})
}

// ---------- Groups ----------

// ListGroups returns all group principals.
// GET /api/v1/principals/groups
func (h *PrincipalsHandler) ListGroups(c *gin.Context) {
	groups, err := h.Provider.ListGroups(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch groups"})
		return
	}
	if groups == nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	c.JSON(http.StatusOK, groups)
}

type createGroupRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

// CreateGroup creates a new group.
// POST /api/v1/principals/groups
func (h *PrincipalsHandler) CreateGroup(c *gin.Context) {
	var req createGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.Provider.CreateGroup(c.Request.Context(), req.Name, req.Description); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to create group: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type updateGroupRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

// UpdateGroup updates a group's name.
// PUT /api/v1/principals/groups/:id
func (h *PrincipalsHandler) UpdateGroup(c *gin.Context) {
	var req updateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.Provider.UpdateGroup(c.Request.Context(), id, req.Name, req.Description); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to update group"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteGroups deletes multiple groups.
// DELETE /api/v1/principals/groups
func (h *PrincipalsHandler) DeleteGroups(c *gin.Context) {
	rawIDs, ok := parseBulkDeleteIDs(c)
	if !ok {
		return
	}

	writeBulkDeleteResponse(c, rawIDs, func(id uuid.UUID) error {
		return h.Provider.DeleteGroup(c.Request.Context(), id)
	})
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

	members, err := h.Provider.GetGroupMembers(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch members"})
		return
	}
	if members == nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	c.JSON(http.StatusOK, members)
}

// AddGroupMembers adds members to a group.
// POST /api/v1/principals/groups/:id/members
func (h *PrincipalsHandler) AddGroupMembers(c *gin.Context) {
	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}

	memberIDs, rawIDs, ok := parseBulkMembershipIDs(c)
	if !ok {
		return
	}

	failed, err := h.Provider.AddGroupMembers(c.Request.Context(), groupID, memberIDs)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to add members: " + err.Error()})
		return
	}

	response := bulkMembershipResponse{
		Succeeded: make([]string, 0, len(rawIDs)),
		Failed:    make([]bulkMembershipFailure, 0),
	}

	for index, memberID := range memberIDs {
		if memberErr, hasFailed := failed[memberID]; hasFailed {
			response.Failed = append(response.Failed, bulkMembershipFailure{
				ID:    rawIDs[index],
				Error: memberErr.Error(),
			})
			continue
		}

		response.Succeeded = append(response.Succeeded, rawIDs[index])
	}

	c.JSON(http.StatusOK, response)
}

// RemoveGroupMembers removes members from a group.
// DELETE /api/v1/principals/groups/:id/members
func (h *PrincipalsHandler) RemoveGroupMembers(c *gin.Context) {
	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}

	memberIDs, rawIDs, ok := parseBulkMembershipIDs(c)
	if !ok {
		return
	}

	failed, err := h.Provider.RemoveGroupMembers(c.Request.Context(), groupID, memberIDs)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to remove members: " + err.Error()})
		return
	}

	response := bulkMembershipResponse{
		Succeeded: make([]string, 0, len(rawIDs)),
		Failed:    make([]bulkMembershipFailure, 0),
	}

	for index, memberID := range memberIDs {
		if memberErr, hasFailed := failed[memberID]; hasFailed {
			response.Failed = append(response.Failed, bulkMembershipFailure{
				ID:    rawIDs[index],
				Error: memberErr.Error(),
			})
			continue
		}

		response.Succeeded = append(response.Succeeded, rawIDs[index])
	}

	c.JSON(http.StatusOK, response)
}

// GetUserGroups returns the groups a user belongs to.
// GET /api/v1/principals/users/:id/groups
func (h *PrincipalsHandler) GetUserGroups(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	groups, err := h.Provider.GetUserGroups(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch user groups"})
		return
	}
	if groups == nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	c.JSON(http.StatusOK, groups)
}

// ---------- Sync ----------

// TriggerSync manually triggers a full sync.
// POST /api/v1/principals/sync
func (h *PrincipalsHandler) TriggerSync(c *gin.Context) {
	if err := h.Provider.TriggerSync(c.Request.Context()); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "sync failed: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
