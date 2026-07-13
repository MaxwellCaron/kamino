package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *PrincipalsHandler) ListUsers(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionManager) {
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
	Password    string      `json:"password"`
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

	principalID, _ := currentPrincipalID(c)

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
			h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "principal.user.create",
				TargetKind:       "principal",
				Metadata:         map[string]any{"username": req.Username},
			}, err.Error())
			continue
		}

		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "principal.user.create",
			TargetKind:       "principal",
			Metadata:         map[string]any{"principal_id": createdID.String(), "username": req.Username},
		})
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
	FullName    string `json:"full_name"`
	Description string `json:"description"`
}

// UpdateUser updates a user's name.
// PUT /api/v1/principals/users/:id
func (h *PrincipalsHandler) UpdateUser(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	normalizedFullName, err := principals.NormalizeFullName(req.FullName)
	if err != nil {
		writeInvalidRequest(c, err.Error())
		return
	}

	if err := h.Provider.UpdateUser(
		c.Request.Context(),
		id,
		req.Username,
		normalizedFullName,
		req.Description,
	); err != nil {
		writePrincipalMutationError(c, "failed to update user", "update user", err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "principal.user.update",
		TargetKind:       "principal",
		Metadata:         map[string]any{"principal_id": id.String()},
	})
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
	principalID, _ := currentPrincipalID(c)

	var req setPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	if err := h.Provider.SetPassword(c.Request.Context(), id, req.Password); err != nil {
		writePrincipalMutationError(c, "failed to set password", "set user password", err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "principal.user.password.set",
		TargetKind:       "principal",
		Metadata:         map[string]any{"principal_id": id.String()},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ChangeOwnPassword changes the authenticated user's password after verifying
// the current password.
// POST /api/v1/principals/self/password
func (h *PrincipalsHandler) ChangeOwnPassword(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
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
			writeInvalidRequest(c, "password change is unavailable for this account")
		default:
			writeLoggedError(c, http.StatusBadGateway, "failed to change password", "change own password", err)
		}
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "principal.user.password.change",
		TargetKind:       "principal",
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// EnableUser enables a user account.
// POST /api/v1/principals/users/:id/enable
func (h *PrincipalsHandler) EnableUser(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	if err := h.Provider.EnableUser(c.Request.Context(), id); err != nil {
		writePrincipalMutationError(c, "failed to enable user", "enable user", err)
		return
	}

	active := true
	if err := database.New(h.DB).UpdatePrincipalStatus(c.Request.Context(), database.UpdatePrincipalStatusParams{
		Status: &active,
		ID:     id,
	}); err != nil {
		logRequestError(c, "mirror account status after enable user", err)
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "principal.user.enable",
		TargetKind:       "principal",
		Metadata:         map[string]any{"principal_id": id.String()},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DisableUser disables a user account.
// POST /api/v1/principals/users/:id/disable
func (h *PrincipalsHandler) DisableUser(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	if err := h.Provider.DisableUser(c.Request.Context(), id); err != nil {
		writePrincipalMutationError(c, "failed to disable user", "disable user", err)
		return
	}

	inactive := false
	if err := database.New(h.DB).UpdatePrincipalStatus(c.Request.Context(), database.UpdatePrincipalStatusParams{
		Status: &inactive,
		ID:     id,
	}); err != nil {
		logRequestError(c, "mirror account status after disable user", err)
	}

	if err := h.Sessions.RevokePrincipalSessions(c.Request.Context(), id); err != nil {
		h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "principal.user.disable",
			TargetKind:       "principal",
			Metadata:         map[string]any{"principal_id": id.String()},
		}, "session revocation failed")
		writeLoggedError(
			c,
			http.StatusInternalServerError,
			"account disabled but active sessions could not be revoked",
			"revoke sessions after disable user",
			err,
		)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "principal.user.disable",
		TargetKind:       "principal",
		Metadata:         map[string]any{"principal_id": id.String()},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteUsers deletes multiple users.
// DELETE /api/v1/principals/users
func (h *PrincipalsHandler) DeleteUsers(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	rawIDs, ok := parseBulkDeleteIDs(c)
	if !ok {
		return
	}

	writeBulkDeleteResponse(c, rawIDs, func(id uuid.UUID) error {
		err := h.Provider.DeleteUser(c.Request.Context(), id)
		if err != nil {
			h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "principal.user.delete",
				TargetKind:       "principal",
				Metadata:         map[string]any{"principal_id": id.String()},
			}, err.Error())
			return err
		}
		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "principal.user.delete",
			TargetKind:       "principal",
			Metadata:         map[string]any{"principal_id": id.String()},
		})
		return nil
	})
}

// ---------- Groups ----------

// ListGroups returns all group principals.
// GET /api/v1/principals/groups
