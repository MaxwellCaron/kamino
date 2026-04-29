package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// PrincipalsHandler handles user and group CRUD via a generic principal provider.
type PrincipalsHandler struct {
	Provider principals.Provider
	Authz    *authorization.Service
}

func (h *PrincipalsHandler) requirePrincipalPermission(
	c *gin.Context,
	required authorization.ManagementPermission,
) bool {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return false
	}

	return requireManagementPermission(c, h.Authz, principalID, required)
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

type bulkCreateFailure struct {
	Name  string `json:"name"`
	Error string `json:"error"`
}

type bulkCreateResponse struct {
	Successful int                 `json:"successful"`
	Total      int                 `json:"total"`
	Failures   []bulkCreateFailure `json:"failures"`
}

type principalResponse struct {
	ID          uuid.UUID  `json:"id"`
	ExternalID  string     `json:"external_id"`
	Name        *string    `json:"name"`
	Description *string    `json:"description"`
	CreatedAt   *time.Time `json:"created_at,omitempty"`
}

func timestamptzPtr(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	t := value.Time
	return &t
}

func userPrincipalResponses(rows []database.GetAllUsersRow) []principalResponse {
	responses := make([]principalResponse, 0, len(rows))
	for _, row := range rows {
		responses = append(responses, principalResponse{
			ID:          row.ID,
			ExternalID:  row.ExternalID,
			Name:        row.Name,
			Description: row.Description,
			CreatedAt:   timestamptzPtr(row.CreatedAt),
		})
	}
	return responses
}

func groupPrincipalResponses(rows []database.GetAllGroupsRow) []principalResponse {
	responses := make([]principalResponse, 0, len(rows))
	for _, row := range rows {
		responses = append(responses, principalResponse{
			ID:          row.ID,
			ExternalID:  row.ExternalID,
			Name:        row.Name,
			Description: row.Description,
			CreatedAt:   timestamptzPtr(row.CreatedAt),
		})
	}
	return responses
}

func uniqueUUIDs(ids []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(ids))
	deduped := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		deduped = append(deduped, id)
	}

	return deduped
}

func parseBulkDeleteIDs(c *gin.Context) ([]string, bool) {
	var req bulkDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
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
			logRequestError(c, "bulk delete principal id="+rawID, err)
			response.Failed = append(response.Failed, bulkDeleteFailure{
				ID:    rawID,
				Error: "delete failed",
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
		writeInvalidRequest(c, "invalid request body")
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
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	users, err := h.Provider.ListUsers(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch users", "list users", err)
		return
	}
	if users == nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	c.JSON(http.StatusOK, userPrincipalResponses(users))
}

type createUserRequest struct {
	Username    string      `json:"username" binding:"required"`
	Description string      `json:"description"`
	Password    string      `json:"password" binding:"required"`
	GroupIDs    []uuid.UUID `json:"group_ids"`
}

// CreateUser creates a new user.
// POST /api/v1/principals/users
func (h *PrincipalsHandler) CreateUser(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	var reqs []createUserRequest
	if err := c.ShouldBindJSON(&reqs); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	if len(reqs) == 0 {
		writeInvalidRequest(c, "at least one user is required")
		return
	}

	type userCreateOutcome struct {
		assignmentErrors []string
		createdID        uuid.UUID
		createErr        error
		groupIDs         []uuid.UUID
		username         string
	}

	outcomes := make([]userCreateOutcome, len(reqs))
	groupAssignments := make(map[uuid.UUID][]int)

	for index, req := range reqs {
		outcomes[index].username = req.Username
		outcomes[index].groupIDs = uniqueUUIDs(req.GroupIDs)

		createdID, err := h.Provider.CreateUser(
			c.Request.Context(),
			req.Username,
			req.Password,
			req.Description,
		)
		if err != nil {
			logRequestError(c, "create user username="+req.Username, err)
			outcomes[index].createErr = err
			continue
		}

		outcomes[index].createdID = createdID
		for _, groupID := range outcomes[index].groupIDs {
			groupAssignments[groupID] = append(groupAssignments[groupID], index)
		}
	}

	for groupID, indexes := range groupAssignments {
		memberIDs := make([]uuid.UUID, 0, len(indexes))
		for _, index := range indexes {
			memberIDs = append(memberIDs, outcomes[index].createdID)
		}

		failed, err := h.Provider.AddGroupMembers(c.Request.Context(), groupID, memberIDs)
		if err != nil {
			logRequestError(c, "add created users to group id="+groupID.String(), err)
			for _, index := range indexes {
				outcomes[index].assignmentErrors = append(
					outcomes[index].assignmentErrors,
					fmt.Sprintf("group %s: %v", groupID, err),
				)
			}
			continue
		}

		for _, index := range indexes {
			if memberErr, hasFailed := failed[outcomes[index].createdID]; hasFailed {
				logRequestError(
					c,
					"add created user to group username="+outcomes[index].username+" group_id="+groupID.String(),
					memberErr,
				)
				outcomes[index].assignmentErrors = append(
					outcomes[index].assignmentErrors,
					fmt.Sprintf("group %s: %v", groupID, memberErr),
				)
			}
		}
	}

	response := bulkCreateResponse{
		Total:    len(reqs),
		Failures: make([]bulkCreateFailure, 0),
	}

	for _, outcome := range outcomes {
		switch {
		case outcome.createErr != nil:
			response.Failures = append(response.Failures, bulkCreateFailure{
				Name:  outcome.username,
				Error: outcome.createErr.Error(),
			})
		case len(outcome.assignmentErrors) > 0:
			response.Failures = append(response.Failures, bulkCreateFailure{
				Name: outcome.username,
				Error: fmt.Sprintf(
					"user created, but group assignment failed: %s",
					strings.Join(outcome.assignmentErrors, "; "),
				),
			})
		default:
			response.Successful++
		}
	}

	c.JSON(http.StatusOK, response)
}

type updateUserRequest struct {
	Username    string `json:"username" binding:"required"`
	Description string `json:"description"`
}

// UpdateUser updates a user's name.
// PUT /api/v1/principals/users/:id
func (h *PrincipalsHandler) UpdateUser(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.Provider.UpdateUser(c.Request.Context(), id, req.Username, req.Description); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to update user", "update user", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type setPasswordRequest struct {
	Password string `json:"password" binding:"required"`
}

type changeOwnPasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required"`
}

// SetPassword sets a user's password.
// POST /api/v1/principals/users/:id/password
func (h *PrincipalsHandler) SetPassword(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	var req setPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.Provider.SetPassword(c.Request.Context(), id, req.Password); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to set password", "set user password", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ChangeOwnPassword changes the authenticated user's password after verifying
// the current password.
// POST /api/v1/principals/self/password
func (h *PrincipalsHandler) ChangeOwnPassword(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req changeOwnPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	if err := h.Provider.ChangePassword(
		c.Request.Context(),
		principalID,
		req.CurrentPassword,
		req.NewPassword,
	); err != nil {
		switch {
		case errors.Is(err, principals.ErrInvalidCredentials):
			c.JSON(http.StatusUnauthorized, gin.H{"error": "current password is incorrect"})
		case errors.Is(err, principals.ErrPrincipalNotFound),
			errors.Is(err, principals.ErrUnsupportedPrincipal):
			c.JSON(http.StatusBadRequest, gin.H{"error": "password change is unavailable for this account"})
		default:
			writeLoggedError(c, http.StatusBadGateway, "failed to change password", "change own password", err)
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// EnableUser enables a user account.
// POST /api/v1/principals/users/:id/enable
func (h *PrincipalsHandler) EnableUser(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.Provider.EnableUser(c.Request.Context(), id); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to enable user", "enable user", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DisableUser disables a user account.
// POST /api/v1/principals/users/:id/disable
func (h *PrincipalsHandler) DisableUser(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.Provider.DisableUser(c.Request.Context(), id); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to disable user", "disable user", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteUsers deletes multiple users.
// DELETE /api/v1/principals/users
func (h *PrincipalsHandler) DeleteUsers(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

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
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	groups, err := h.Provider.ListGroups(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch groups", "list groups", err)
		return
	}
	if groups == nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	c.JSON(http.StatusOK, groupPrincipalResponses(groups))
}

type createGroupRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

// CreateGroup creates a new group.
// POST /api/v1/principals/groups
func (h *PrincipalsHandler) CreateGroup(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	var reqs []createGroupRequest
	if err := c.ShouldBindJSON(&reqs); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	if len(reqs) == 0 {
		writeInvalidRequest(c, "at least one group is required")
		return
	}

	response := bulkCreateResponse{
		Total:    len(reqs),
		Failures: make([]bulkCreateFailure, 0),
	}

	for _, req := range reqs {
		if _, err := h.Provider.CreateGroup(c.Request.Context(), req.Name, req.Description); err != nil {
			logRequestError(c, "create group name="+req.Name, err)
			response.Failures = append(response.Failures, bulkCreateFailure{
				Name:  req.Name,
				Error: err.Error(),
			})
			continue
		}

		response.Successful++
	}

	c.JSON(http.StatusOK, response)
}

type updateGroupRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

// UpdateGroup updates a group's name.
// PUT /api/v1/principals/groups/:id
func (h *PrincipalsHandler) UpdateGroup(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	var req updateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.Provider.UpdateGroup(c.Request.Context(), id, req.Name, req.Description); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to update group", "update group", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteGroups deletes multiple groups.
// DELETE /api/v1/principals/groups
func (h *PrincipalsHandler) DeleteGroups(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

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
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	members, err := h.Provider.GetGroupMembers(c.Request.Context(), id)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch members", "get group members", err)
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
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

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
		writeLoggedError(c, http.StatusBadGateway, "failed to add members", "add group members", err)
		return
	}

	response := bulkMembershipResponse{
		Succeeded: make([]string, 0, len(rawIDs)),
		Failed:    make([]bulkMembershipFailure, 0),
	}

	for index, memberID := range memberIDs {
		if memberErr, hasFailed := failed[memberID]; hasFailed {
			logRequestError(c, "add group member id="+rawIDs[index], memberErr)
			response.Failed = append(response.Failed, bulkMembershipFailure{
				ID:    rawIDs[index],
				Error: "add failed",
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
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

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
		writeLoggedError(c, http.StatusBadGateway, "failed to remove members", "remove group members", err)
		return
	}

	response := bulkMembershipResponse{
		Succeeded: make([]string, 0, len(rawIDs)),
		Failed:    make([]bulkMembershipFailure, 0),
	}

	for index, memberID := range memberIDs {
		if memberErr, hasFailed := failed[memberID]; hasFailed {
			logRequestError(c, "remove group member id="+rawIDs[index], memberErr)
			response.Failed = append(response.Failed, bulkMembershipFailure{
				ID:    rawIDs[index],
				Error: "remove failed",
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
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	groups, err := h.Provider.GetUserGroups(c.Request.Context(), id)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to fetch user groups", "get user groups", err)
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
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	if err := h.Provider.TriggerSync(c.Request.Context()); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "sync failed", "trigger principals sync", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
