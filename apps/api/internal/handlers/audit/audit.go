package audit

import (
	"context"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// auditAuthz is the narrow slice of authorization.Service that AuditHandler
// needs, so tests can fake the management-permission decision.
type auditAuthz interface {
	RequireManagement(ctx context.Context, principalID uuid.UUID, required authorization.ManagementPermission) error
}

type AuditHandler struct {
	Audit *audit.Service
	Authz auditAuthz
}

type actionEventResponse struct {
	ID                      int64   `json:"id"`
	ActorPrincipalID        *string `json:"actor_principal_id,omitempty"`
	ActorUsername           string  `json:"actor_username"`
	ActionKind              string  `json:"action_kind"`
	TargetKind              string  `json:"target_kind"`
	InventoryItemID         *string `json:"inventory_item_id,omitempty"`
	InventoryItemName       *string `json:"inventory_item_name,omitempty"`
	InventoryItemParentID   *string `json:"inventory_item_parent_id,omitempty"`
	InventoryItemParentName *string `json:"inventory_item_parent_name,omitempty"`
	InventoryItemPath       *string `json:"inventory_item_path,omitempty"`
	InventoryVmNode         *string `json:"inventory_vm_node,omitempty"`
	InventoryVmVmid         *int32  `json:"inventory_vm_vmid,omitempty"`
	PodID                   *string `json:"pod_id,omitempty"`
	PodTitle                *string `json:"pod_title,omitempty"`
	PodSlug                 *string `json:"pod_slug,omitempty"`
	PodFolderPath           *string `json:"pod_folder_path,omitempty"`
	Status                  string  `json:"status"`
	ErrorMessage            *string `json:"error_message,omitempty"`
	CreatedAt               string  `json:"created_at"`
}

type actionEventsListResponse struct {
	Items []actionEventResponse `json:"items"`
	Total int32                 `json:"total"`
	Page  int32                 `json:"page"`
	Rows  int32                 `json:"rows"`
}

func buildActionEventResponse(row database.ListActionEventsPaginatedRow) actionEventResponse {
	item := actionEventResponse{
		ID:         row.ID,
		ActionKind: row.ActionKind,
		TargetKind: row.TargetKind,
		Status:     row.Status,

		ActorUsername: row.ActorUsername,
	}
	if row.ActorPrincipalID != nil {
		item.ActorPrincipalID = new(row.ActorPrincipalID.String())
	}
	if row.InventoryItemID != nil {
		item.InventoryItemID = new(row.InventoryItemID.String())
	}
	if row.InventoryItemName != "" {
		item.InventoryItemName = &row.InventoryItemName
	}
	if row.InventoryItemParentID != nil {
		item.InventoryItemParentID = new(row.InventoryItemParentID.String())
	}
	if row.InventoryItemParentName != "" {
		item.InventoryItemParentName = &row.InventoryItemParentName
	}
	if row.InventoryItemPath != "" {
		item.InventoryItemPath = &row.InventoryItemPath
	}
	if row.InventoryVmNode != "" {
		item.InventoryVmNode = &row.InventoryVmNode
	}
	if row.InventoryVmVmid > 0 {
		vmid := row.InventoryVmVmid
		item.InventoryVmVmid = &vmid
	}
	if row.PodID != nil {
		item.PodID = new(row.PodID.String())
	}
	if row.PodTitle != "" {
		item.PodTitle = &row.PodTitle
	}
	if row.PodSlug != "" {
		item.PodSlug = &row.PodSlug
	}
	if row.PodFolderPath != "" {
		item.PodFolderPath = &row.PodFolderPath
	}
	if row.ErrorMessage != nil {
		item.ErrorMessage = row.ErrorMessage
	}
	if row.CreatedAt.Valid {
		item.CreatedAt = row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z")
	}
	return item
}

func (h *AuditHandler) requireAdministrator(c *gin.Context) bool {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return false
	}
	return httpx.RequireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionAdministrator)
}

// List returns paginated action events.
// GET /api/v1/admin/audit/actions
func (h *AuditHandler) List(c *gin.Context) {
	if !h.requireAdministrator(c) {
		return
	}

	page, ok := httpx.ParsePageParam(c.Query("page"))
	if !ok {
		httpx.WriteInvalidRequest(c, "invalid page")
		return
	}

	rows, ok := httpx.ParseRowsParam(c.Query("rows"))
	if !ok {
		httpx.WriteInvalidRequest(c, "invalid rows")
		return
	}

	search := strings.TrimSpace(c.Query("search"))

	result, err := h.Audit.List(c.Request.Context(), audit.ListParams{
		Page:   page,
		Rows:   rows,
		Search: search,
	})
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load audit events", "list action events", err)
		return
	}

	items := make([]actionEventResponse, 0, len(result.Items))
	for _, row := range result.Items {
		items = append(items, buildActionEventResponse(row))
	}

	c.JSON(http.StatusOK, actionEventsListResponse{
		Items: items,
		Total: result.Total,
		Page:  result.Page,
		Rows:  result.Rows,
	})
}
