package proxmoxadmin

import (
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmoxsync"
	"github.com/gin-gonic/gin"
)

type ProxmoxSyncHandler struct {
	Importer *proxmoxsync.InventoryImporter
	Service  *inventory.Service
	Authz    *authorization.Service
	Audit    *audit.Service
}

type syncApplyResponse struct {
	Results []proxmoxsync.SyncApplyResult `json:"results"`
	Applied int                           `json:"applied"`
	Failed  int                           `json:"failed"`
	Skipped int                           `json:"skipped"`
}

func (h *ProxmoxSyncHandler) requireAdmin(c *gin.Context) bool {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return false
	}
	return httpx.RequireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionAdministrator)
}

// Preview computes and returns the drift diff without making any changes.
// GET /api/v1/admin/proxmox/sync/preview
func (h *ProxmoxSyncHandler) Preview(c *gin.Context) {
	if !h.requireAdmin(c) {
		return
	}

	diff, err := h.Importer.Plan(c.Request.Context())
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusBadGateway, "failed to compute sync diff", "plan proxmox sync", err)
		return
	}

	c.JSON(http.StatusOK, diff)
}

// Apply imports selected live Proxmox changes into Kamino.
func (h *ProxmoxSyncHandler) Apply(c *gin.Context) {
	if !h.requireAdmin(c) {
		return
	}
	principalID, _ := httpx.CurrentPrincipalID(c)

	var sel proxmoxsync.SyncSelection
	if err := c.ShouldBindJSON(&sel); err != nil {
		httpx.WriteInvalidRequest(c, "invalid request body")
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
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "sync apply failed", "apply proxmox sync", err)
		return
	}

	h.Service.NotifyInventoryTreeChanged(ctx)

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
		resp.Results = []proxmoxsync.SyncApplyResult{}
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
