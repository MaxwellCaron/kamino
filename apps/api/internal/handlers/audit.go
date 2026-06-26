package handlers

import (
	"net/http"
	"strconv"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
)

// AuditHandler serves admin audit ledger endpoints.
type AuditHandler struct {
	Audit *audit.Service
	Authz *authorization.Service
}

func (h *AuditHandler) requireManager(c *gin.Context) bool {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return false
	}
	return requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager)
}

type actionEventResponse struct {
	ID                int64   `json:"id"`
	ActorPrincipalID  *string `json:"actor_principal_id,omitempty"`
	ActorUsername     string  `json:"actor_username"`
	ActionKind        string  `json:"action_kind"`
	TargetKind        string  `json:"target_kind"`
	InventoryItemID   *string `json:"inventory_item_id,omitempty"`
	InventoryItemName *string `json:"inventory_item_name,omitempty"`
	PodID             *string `json:"pod_id,omitempty"`
	Status            string  `json:"status"`
	ErrorMessage      *string `json:"error_message,omitempty"`
	CreatedAt         string  `json:"created_at"`
}

type actionEventsListResponse struct {
	Items      []actionEventResponse `json:"items"`
	Total      int32                 `json:"total"`
	NextCursor *int64                `json:"next_cursor,omitempty"`
}

// List returns paginated action events.
// GET /api/v1/admin/audit/actions
func (h *AuditHandler) List(c *gin.Context) {
	if !h.requireManager(c) {
		return
	}

	pageSize := int32(50)
	if raw := c.Query("page_size"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 100 {
			pageSize = int32(parsed)
		}
	}

	var cursorID *int64
	var cursorTS *pgtype.Timestamptz
	if raw := c.Query("cursor"); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			cursorID = &parsed
		}
	}

	result, err := h.Audit.List(c.Request.Context(), audit.ListParams{
		CursorID:        cursorID,
		CursorCreatedAt: cursorTS,
		PageSize:        pageSize,
	})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load audit events", "list action events", err)
		return
	}

	items := make([]actionEventResponse, 0, len(result.Items))
	for _, row := range result.Items {
		item := actionEventResponse{
			ID:                row.ID,
			ActionKind:        row.ActionKind,
			TargetKind:        row.TargetKind,
			Status:            row.Status,
			ActorUsername:     row.ActorUsername,
			InventoryItemName: row.InventoryItemName,
		}
		if row.ActorPrincipalID != nil {
			s := row.ActorPrincipalID.String()
			item.ActorPrincipalID = &s
		}
		if row.InventoryItemID != nil {
			s := row.InventoryItemID.String()
			item.InventoryItemID = &s
		}
		if row.PodID != nil {
			s := row.PodID.String()
			item.PodID = &s
		}
		if row.ErrorMessage != nil {
			item.ErrorMessage = row.ErrorMessage
		}
		if row.CreatedAt.Valid {
			item.CreatedAt = row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z")
		}
		items = append(items, item)
	}

	c.JSON(http.StatusOK, actionEventsListResponse{
		Items:      items,
		Total:      result.Total,
		NextCursor: result.NextCursor,
	})
}
