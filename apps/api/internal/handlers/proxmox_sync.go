package handlers

import (
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

// ProxmoxSyncHandler serves the admin Proxmox drift sync endpoints.
type ProxmoxSyncHandler struct {
	Importer *proxmox.InventoryImporter
	Service  *inventory.Service
	Mirror   *proxmox.InventoryMirror
	Authz    *authorization.Service
	Audit    *audit.Service
}

func (h *ProxmoxSyncHandler) requireAdmin(c *gin.Context) bool {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return false
	}
	return requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionAdministrator)
}

// Preview computes and returns the drift diff without making any changes.
// GET /api/v1/admin/proxmox/sync/preview
func (h *ProxmoxSyncHandler) Preview(c *gin.Context) {
	if !h.requireAdmin(c) {
		return
	}

	diff, err := h.Importer.Plan(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to compute sync diff", "plan proxmox sync", err)
		return
	}

	c.JSON(http.StatusOK, diff)
}

type syncApplyResponse struct {
	Results []proxmox.SyncApplyResult `json:"results"`
	Applied int                       `json:"applied"`
	Failed  int                       `json:"failed"`
	Skipped int                       `json:"skipped"`
}

// Apply re-derives the live diff, applies the selected changes, notifies the
// inventory tree, and schedules a mirror reconcile.
// POST /api/v1/admin/proxmox/sync/apply
func (h *ProxmoxSyncHandler) Apply(c *gin.Context) {
	if !h.requireAdmin(c) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	var sel proxmox.SyncSelection
	if err := c.ShouldBindJSON(&sel); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	ctx := c.Request.Context()
	results, err := h.Importer.ApplySync(ctx, sel)
	if err != nil {
		h.Audit.RecordFailure(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "proxmox.sync.apply",
			TargetKind:       "proxmox_sync",
		}, err.Error())
		writeLoggedError(c, http.StatusInternalServerError, "sync apply failed", "apply proxmox sync", err)
		return
	}

	h.Service.NotifyInventoryTreeChanged(ctx)
	h.Mirror.ScheduleReconcile()

	resp := syncApplyResponse{Results: results}
	for _, r := range results {
		switch r.Status {
		case "success":
			resp.Applied++
		case "error":
			resp.Failed++
		default:
			resp.Skipped++
		}
	}
	if resp.Results == nil {
		resp.Results = []proxmox.SyncApplyResult{}
	}

	h.Audit.RecordSuccess(ctx, audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "proxmox.sync.apply",
		TargetKind:       "proxmox_sync",
		Metadata: map[string]any{
			"applied": resp.Applied,
			"failed":  resp.Failed,
			"skipped": resp.Skipped,
		},
	})
	c.JSON(http.StatusOK, resp)
}
