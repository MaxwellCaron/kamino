package handlers

import (
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *PrincipalsHandler) ListGroups(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionManager) {
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
	principalID, _ := currentPrincipalID(c)

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
			h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "principal.group.create",
				TargetKind:       "principal",
				Metadata:         map[string]any{"name": req.Name},
			}, err.Error())
			continue
		}

		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "principal.group.create",
			TargetKind:       "principal",
			Metadata:         map[string]any{"name": req.Name},
		})
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
	principalID, _ := currentPrincipalID(c)

	var req updateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	if err := h.Provider.UpdateGroup(c.Request.Context(), id, req.Name, req.Description); err != nil {
		writePrincipalMutationError(c, "failed to update group", "update group", err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "principal.group.update",
		TargetKind:       "principal",
		Metadata:         map[string]any{"principal_id": id.String()},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteGroups deletes multiple groups.
// DELETE /api/v1/principals/groups
func (h *PrincipalsHandler) DeleteGroups(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	rawIDs, ok := parseBulkDeleteIDs(c)
	if !ok {
		return
	}

	writeBulkDeleteResponse(c, rawIDs, func(id uuid.UUID) error {
		err := h.Provider.DeleteGroup(c.Request.Context(), id)
		if err != nil {
			h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "principal.group.delete",
				TargetKind:       "principal",
				Metadata:         map[string]any{"principal_id": id.String()},
			}, err.Error())
			return err
		}
		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "principal.group.delete",
			TargetKind:       "principal",
			Metadata:         map[string]any{"principal_id": id.String()},
		})
		return nil
	})
}

// ---------- Group Members ----------

// GetGroupMembers returns the members of a group.
// GET /api/v1/principals/groups/:id/members
