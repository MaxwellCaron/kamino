package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
)

// allowedTableRowCounts are the row-per-page options exposed by the shared
// DataTable rows-per-page selector. Audit and request table endpoints only
// accept these values.
var allowedTableRowCounts = map[int]bool{
	10: true,
	20: true,
	25: true,
	30: true,
	40: true,
	50: true,
}

// parsePageParam parses a one-based page query parameter. Missing values
// default to 1. Invalid or out-of-range values are rejected.
func parsePageParam(raw string) (int32, bool) {
	if raw == "" {
		return 1, true
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed < 1 {
		return 0, false
	}
	return int32(parsed), true
}

// parseRowsParam parses a rows-per-page query parameter against the allowed
// table row options. Missing values default to 25.
func parseRowsParam(raw string) (int32, bool) {
	if raw == "" {
		return 25, true
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || !allowedTableRowCounts[parsed] {
		return 0, false
	}
	return int32(parsed), true
}

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

// List returns paginated action events.
// GET /api/v1/admin/audit/actions
func (h *AuditHandler) List(c *gin.Context) {
	if !h.requireManager(c) {
		return
	}

	page, ok := parsePageParam(c.Query("page"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid page"})
		return
	}

	rows, ok := parseRowsParam(c.Query("rows"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rows"})
		return
	}

	search := strings.TrimSpace(c.Query("search"))

	result, err := h.Audit.List(c.Request.Context(), audit.ListParams{
		Page:   page,
		Rows:   rows,
		Search: search,
	})
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load audit events", "list action events", err)
		return
	}

	items := make([]actionEventResponse, 0, len(result.Items))
	for _, row := range result.Items {
		item := actionEventResponse{
			ID:                      row.ID,
			ActionKind:              row.ActionKind,
			TargetKind:              row.TargetKind,
			Status:                  row.Status,
			ActorUsername:           row.ActorUsername,
			InventoryItemName:       row.InventoryItemName,
			InventoryItemParentName: row.InventoryItemParentName,
			InventoryVmNode:         row.InventoryVmNode,
			InventoryVmVmid:         row.InventoryVmVmid,
		}
		if row.ActorPrincipalID != nil {
			s := row.ActorPrincipalID.String()
			item.ActorPrincipalID = &s
		}
		if row.InventoryItemID != nil {
			s := row.InventoryItemID.String()
			item.InventoryItemID = &s
		}
		if row.InventoryItemParentID != nil {
			s := row.InventoryItemParentID.String()
			item.InventoryItemParentID = &s
		}
		if row.InventoryItemPath != "" {
			item.InventoryItemPath = &row.InventoryItemPath
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
		Items: items,
		Total: result.Total,
		Page:  result.Page,
		Rows:  result.Rows,
	})
}
