package handlers

import (
	"net/http"
	"sort"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *VMHandler) CreateSnapshot(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	var req createSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.SnapshotVM, true)
	if !ok {
		return
	}
	if target.GuestType == proxmox.GuestLXC && req.VMState {
		writeContainerNotSupported(c)
		return
	}

	h.runClaimedVMAction(c, target.ItemID, "create_snapshot", principalID, func() bool {
		if err := h.Actions.CreateSnapshot(
			c.Request.Context(),
			vmActionTarget(target),
			req.Snapname,
			req.Description,
			req.VMState,
		); err != nil {
			h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "vm.snapshot.create",
				TargetKind:       "vm",
				InventoryItemID:  &target.ItemID,
			}, err.Error())
			writeLoggedError(c, http.StatusBadGateway, "failed to create snapshot", "create vm snapshot", err)
			return false
		}

		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.snapshot.create",
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
			Metadata:         map[string]any{"snapname": req.Snapname},
		})
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return true
	})
}

func (h *VMHandler) requireVerifiedVMSnapshotReadAccess(
	c *gin.Context,
	principalID uuid.UUID,
	itemID uuid.UUID,
) (verifiedVMTarget, bool) {
	target, reqErr := resolveVerifiedVMItemPermission(
		c.Request.Context(),
		h.Authz,
		h.PX,
		principalID,
		itemID,
		authorization.ViewSnapshots,
		false,
	)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return verifiedVMTarget{}, false
	}

	return target, true
}

// GetSnapshots returns all snapshots for a VM.
// GET /api/v1/inventory/items/:id/vm/snapshots
func (h *VMHandler) GetSnapshots(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := h.requireVerifiedVMSnapshotReadAccess(c, principalID, itemID)
	if !ok {
		return
	}

	snapshots, err := h.PX.GetSnapshots(c.Request.Context(), target.GuestType, target.Node, target.VMID)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch snapshots", "fetch vm snapshots", err)
		return
	}

	sort.Slice(snapshots, func(i, j int) bool {
		return snapshots[i].Snaptime < snapshots[j].Snaptime
	})

	c.JSON(http.StatusOK, snapshots)
}

type rollbackSnapshotRequest struct {
	Snapname string `json:"snapname" binding:"required"`
}

// RollbackSnapshot rolls back a VM to a snapshot and waits for the Proxmox task to complete.
// POST /api/v1/inventory/items/:id/vm/snapshots/rollback
func (h *VMHandler) RollbackSnapshot(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	var req rollbackSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.SnapshotVM, true)
	if !ok {
		return
	}

	h.runClaimedVMAction(c, target.ItemID, "rollback_snapshot", principalID, func() bool {
		if err := h.Actions.RollbackSnapshot(
			c.Request.Context(),
			vmActionTarget(target),
			req.Snapname,
		); err != nil {
			h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "vm.snapshot.rollback",
				TargetKind:       "vm",
				InventoryItemID:  &target.ItemID,
			}, err.Error())
			writeLoggedError(c, http.StatusBadGateway, "failed to rollback snapshot", "rollback vm snapshot", err)
			return false
		}

		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.snapshot.rollback",
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
			Metadata:         map[string]any{"snapname": req.Snapname},
		})
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return true
	})
}

// DeleteSnapshot deletes a VM snapshot and waits for the Proxmox task to complete.
// DELETE /api/v1/inventory/items/:id/vm/snapshots/:snapname
func (h *VMHandler) DeleteSnapshot(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	snapname := c.Param("snapname")
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.SnapshotVM, true)
	if !ok {
		return
	}

	h.runClaimedVMAction(c, target.ItemID, "delete_snapshot", principalID, func() bool {
		if err := h.PX.DeleteSnapshot(c.Request.Context(), target.GuestType, target.Node, target.VMID, snapname); err != nil {
			h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "vm.snapshot.delete",
				TargetKind:       "vm",
				InventoryItemID:  &target.ItemID,
			}, err.Error())
			writeLoggedError(c, http.StatusBadGateway, "failed to delete snapshot", "delete vm snapshot", err)
			return false
		}

		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.snapshot.delete",
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
			Metadata:         map[string]any{"snapname": snapname},
		})
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return true
	})
}
