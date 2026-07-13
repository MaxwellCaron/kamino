package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type principalDisabler interface {
	DisableUser(context.Context, uuid.UUID) error
}

type principalSessionRevoker interface {
	RevokePrincipalSessions(context.Context, uuid.UUID) error
}

func disableUserAndRevokeSessions(
	ctx context.Context,
	provider principalDisabler,
	revoker principalSessionRevoker,
	principalID uuid.UUID,
) error {
	if err := provider.DisableUser(ctx, principalID); err != nil {
		return err
	}
	if err := revoker.RevokePrincipalSessions(ctx, principalID); err != nil {
		return err
	}
	return nil
}

// PrincipalsHandler handles user and group CRUD via a generic principal provider.
type PrincipalsHandler struct {
	Provider principals.Provider
	Authz    *authorization.Service
	Audit    *audit.Service
	Sessions principalSessionRevoker
	DB       *pgxpool.Pool
}

func (h *PrincipalsHandler) requirePrincipalPermission(
	c *gin.Context,
	required authorization.ManagementPermission,
) bool {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
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
	FullName    *string    `json:"full_name"`
	Description *string    `json:"description"`
	CreatedAt   *time.Time `json:"created_at,omitempty"`
	Status      *bool      `json:"status,omitempty"`
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
			FullName:    row.FullName,
			Description: row.Description,
			CreatedAt:   timestamptzPtr(row.CreatedAt),
			Status:      row.Status,
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
			FullName:    row.FullName,
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
			writeInvalidRequest(c, "invalid id")
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
				Error: bulkPrincipalDeleteError(err),
			})
			continue
		}

		response.Deleted = append(response.Deleted, rawIDs[i])
	}

	c.JSON(http.StatusOK, response)
}

func bulkPrincipalDeleteError(err error) string {
	switch {
	case errors.Is(err, principals.ErrPrincipalInUse):
		return err.Error()
	case errors.Is(err, principals.ErrUnsupportedPrincipal):
		return "unsupported principal"
	default:
		return "delete failed"
	}
}

func writePrincipalMutationError(c *gin.Context, message, operation string, err error) {
	if errors.Is(err, principals.ErrUnsupportedPrincipal) {
		writeInvalidRequest(c, "unsupported principal")
		return
	}
	writeLoggedError(c, http.StatusBadGateway, message, operation, err)
}

// GetProvider returns the configured principal provider capabilities.
// GET /api/v1/principals/provider
func (h *PrincipalsHandler) GetProvider(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionManager) {
		return
	}
	c.JSON(http.StatusOK, h.Provider.Capabilities())
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
			writeInvalidRequest(c, "invalid member id")
			return nil, nil, false
		}
		memberIDs = append(memberIDs, id)
	}

	return memberIDs, req.MemberIDs, true
}

// ---------- Users ----------

// ListUsers returns all user principals.
// GET /api/v1/principals/users
func (h *PrincipalsHandler) TriggerSync(c *gin.Context) {
	if !h.requirePrincipalPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	if err := h.Provider.TriggerSync(c.Request.Context()); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "sync failed", "trigger principals sync", err)
		return
	}
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "principal.sync",
		TargetKind:       "principal",
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
