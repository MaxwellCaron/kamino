package handlers

import (
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *PrincipalsHandler) GetGroupMembers(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
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
	principalID, _ := currentPrincipalID(c)

	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid group id")
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
			h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "principal.group.member.add",
				TargetKind:       "principal",
				Metadata:         map[string]any{"group_id": groupID.String(), "member_id": memberID.String()},
			}, memberErr.Error())
			continue
		}

		response.Succeeded = append(response.Succeeded, rawIDs[index])
		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "principal.group.member.add",
			TargetKind:       "principal",
			Metadata:         map[string]any{"group_id": groupID.String(), "member_id": memberID.String()},
		})
	}

	c.JSON(http.StatusOK, response)
}

// RemoveGroupMembers removes members from a group.
// DELETE /api/v1/principals/groups/:id/members
func (h *PrincipalsHandler) RemoveGroupMembers(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid group id")
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
			h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "principal.group.member.remove",
				TargetKind:       "principal",
				Metadata:         map[string]any{"group_id": groupID.String(), "member_id": memberID.String()},
			}, memberErr.Error())
			continue
		}

		response.Succeeded = append(response.Succeeded, rawIDs[index])
		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "principal.group.member.remove",
			TargetKind:       "principal",
			Metadata:         map[string]any{"group_id": groupID.String(), "member_id": memberID.String()},
		})
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
		writeInvalidRequest(c, "invalid id")
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
