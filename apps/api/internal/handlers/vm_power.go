package handlers

import (
	"fmt"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
)

type powerActionRequest struct {
	Action  string   `json:"action" binding:"required,oneof=start shutdown reboot stop"`
	ItemIDs []string `json:"item_ids" binding:"required,min=1"`
}

// PowerAction performs a power action (start, shutdown, reboot, stop) on one or more VMs
// and waits for the Proxmox task to complete.
// POST /api/v1/inventory/vms/power
func (h *VMHandler) PowerAction(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	var req powerActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	itemIDs, err := parseBulkVMItemIDs(req.ItemIDs)
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	targets, response := h.collectVerifiedVMTargets(
		c,
		principalID,
		itemIDs,
		authorization.PowerVM,
		true,
	)

	ctx := c.Request.Context()
	for _, target := range targets {
		actionErr, claimed := h.runClaimedBulkVMAction(ctx, target, "power_action", principalID, func() error {
			return h.Actions.PowerAction(
				ctx,
				vmActionTarget(target),
				vmactions.PowerAction(req.Action),
			)
		})
		if !claimed {
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: "another action is already in progress for this VM",
			})
			continue
		}
		if actionErr != nil {
			logRequestError(c, fmt.Sprintf("vm power action=%s item_id=%s", req.Action, target.ItemID), actionErr)
			h.Audit.RecordFailure(ctx, audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "vm.power." + req.Action,
				TargetKind:       "vm",
				InventoryItemID:  &target.ItemID,
			}, actionErr.Error())
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: fmt.Sprintf("%s failed", req.Action),
			})
			continue
		}

		h.Audit.RecordSuccess(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.power." + req.Action,
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
		})
		response.Succeeded = append(response.Succeeded, target.ItemID.String())
	}

	c.JSON(http.StatusOK, response)
}

// DeleteVM deletes one or more VMs from Proxmox (waits for the task to complete) and
// removes it from the inventory.
// DELETE /api/v1/inventory/vms
func (h *VMHandler) DeleteVM(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	var req bulkVMItemsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	itemIDs, err := parseBulkVMItemIDs(req.ItemIDs)
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	targets, response := h.collectVerifiedVMTargets(
		c,
		principalID,
		itemIDs,
		authorization.DeleteVM,
		true,
	)

	ctx := c.Request.Context()
	for _, target := range targets {
		actionErr, claimed := h.runClaimedBulkVMAction(ctx, target, "delete_vm", principalID, func() error {
			return h.Actions.DeleteVM(ctx, vmActionTarget(target))
		})
		if !claimed {
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: "another action is already in progress for this VM",
			})
			continue
		}
		if actionErr != nil {
			logRequestError(c, "delete proxmox vm item_id="+target.ItemID.String(), actionErr)
			h.Audit.RecordFailure(ctx, audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "vm.delete",
				TargetKind:       "vm",
				InventoryItemID:  &target.ItemID,
			}, actionErr.Error())
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: "delete failed",
			})
			continue
		}
		h.Audit.RecordSuccess(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.delete",
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
		})
		response.Succeeded = append(response.Succeeded, target.ItemID.String())
	}

	c.JSON(http.StatusOK, response)
}
