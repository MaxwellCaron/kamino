package handlers

import (
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type cloneVMRequest struct {
	NewID          int    `json:"newid"`
	Name           string `json:"name" binding:"required"`
	Full           bool   `json:"full"`
	Target         string `json:"target"`
	TargetFolderID string `json:"target_folder_id" binding:"required"`
}

type vmMutationResponse struct {
	OK     bool          `json:"ok"`
	VMID   int           `json:"vmid"`
	ItemID uuid.UUID     `json:"item_id"`
	Item   InventoryItem `json:"item"`
}

// CloneVM clones a VM and waits for the Proxmox task to complete.
// POST /api/v1/inventory/items/:id/vm/clone
func (h *VMHandler) CloneVM(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	var req cloneVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	req.Name = names.Normalize(req.Name)
	if err := names.ValidateVM(req.Name); err != nil {
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate vm name", err)
		return
	}
	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	source, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.CloneVM, true)
	if !ok {
		return
	}
	if source.GuestType == proxmox.GuestLXC {
		writeContainerNotSupported(c)
		return
	}

	targetFolderID, err := uuid.Parse(req.TargetFolderID)
	if err != nil {
		writeInvalidRequest(c, "invalid target_folder_id")
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, targetFolderID, authorization.CreateVM) {
		return
	}

	placement, err := h.Service.ResolveFolderPlacement(c.Request.Context(), targetFolderID)
	if err != nil {
		writeInventoryError(c, err)
		return
	}
	reservation, err := h.Service.ReserveFolderVMCapacity(c.Request.Context(), targetFolderID, 1, "vm_clone")
	if err != nil {
		writeInventoryError(c, err)
		return
	}
	if reservation != nil {
		defer reservation.Release(c.Request.Context())
	}

	targetNode := strings.TrimSpace(req.Target)
	if targetNode == "" {
		optimalNode, err := h.PX.GetOptimalNode(c.Request.Context())
		if err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to resolve optimal node", "resolve optimal node", err)
			return
		}
		targetNode = optimalNode.Node
	}

	// The source VM is the inventory item being mutated for the duration of
	// the clone (Proxmox reads its disks/config); claim it so a concurrent
	// rename/delete/power action on the source cannot interleave.
	h.runClaimedVMAction(c, source.ItemID, "clone_vm", principalID, func() bool {
		newID, err := runWithAvailableVMID(c.Request.Context(), h.Allocator, req.NewID, func(vmid int) error {
			return h.PX.CloneVM(c.Request.Context(), source.Node, source.VMID, vmid, req.Name, req.Full, targetNode)
		})
		switch {
		case err == nil:
		case isVMIDUnavailable(err):
			writeConflict(c, "VM ID is already in use")
			return false
		default:
			writeLoggedError(c, http.StatusBadGateway, "failed to clone VM", "clone proxmox vm", err)
			return false
		}

		if err := h.PX.SetVMUpstreamUUID(c.Request.Context(), targetNode, newID, uuid.New()); err != nil {
			cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, newID, "cloned VM identity failure")
			writeLoggedError(c, http.StatusBadGateway, "failed to assign clone identity", "assign cloned vm upstream uuid", err)
			return false
		}

		if err := h.PX.SyncVMPoolMembership(c.Request.Context(), targetNode, newID, placement.PoolID, placement.Path); err != nil {
			cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, newID, "cloned VM pool sync failure")
			writeLoggedError(c, http.StatusBadGateway, "failed to sync VM pool membership", "sync cloned vm pool membership", err)
			return false
		}

		clonedItemID, err := h.Importer.SyncVM(
			c.Request.Context(),
			placement.FolderID,
			targetNode,
			newID,
			proxmox.GuestQEMU,
		)
		if err != nil {
			cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, newID, "cloned VM inventory sync failure")
			writeLoggedError(c, http.StatusInternalServerError, "vm cloned in Proxmox but failed to sync inventory metadata", "sync cloned vm inventory metadata", err)
			return false
		}

		h.Service.NotifyInventoryChanged(c.Request.Context(), clonedItemID)

		item, err := h.Service.GetInventoryItemWithPermissions(
			c.Request.Context(),
			principalID,
			clonedItemID,
		)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "vm cloned in Proxmox but failed to load inventory item", "load cloned vm inventory item", err)
			return false
		}

		c.JSON(http.StatusOK, vmMutationResponse{
			OK:     true,
			VMID:   newID,
			ItemID: clonedItemID,
			Item:   buildInventoryItem(item),
		})
		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.clone",
			TargetKind:       "vm",
			InventoryItemID:  &source.ItemID,
			Metadata:         map[string]any{"new_vmid": newID, "cloned_item_id": clonedItemID.String()},
		})
		return true
	})
}

// ConvertToTemplate converts one or more VMs to templates.
// POST /api/v1/inventory/vms/template
func (h *VMHandler) ConvertToTemplate(c *gin.Context) {
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
		authorization.TemplateVM,
		true,
	)

	ctx := c.Request.Context()
	for _, target := range targets {
		if target.GuestType == proxmox.GuestLXC {
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: "not supported for containers",
			})
			continue
		}
		inventorySyncFailed := false
		actionErr, claimed := h.runClaimedBulkVMAction(ctx, target, "convert_to_template", principalID, func() error {
			if err := h.PX.ConvertToTemplate(ctx, target.Node, target.VMID); err != nil {
				return err
			}
			if err := h.Service.UpdateInventoryVMIsTemplate(ctx, target.ItemID); err != nil {
				inventorySyncFailed = true
				return err
			}
			return nil
		})
		if !claimed {
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: "another action is already in progress for this VM",
			})
			continue
		}
		if actionErr != nil {
			errMessage := "templatize failed"
			operation := "convert vm to template"
			if inventorySyncFailed {
				errMessage = "inventory sync failed"
				operation = "update vm template state in inventory"
			}
			logRequestError(c, operation+" item_id="+target.ItemID.String(), actionErr)
			h.Audit.RecordFailure(ctx, audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "vm.template",
				TargetKind:       "vm",
				InventoryItemID:  &target.ItemID,
			}, errMessage)
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: errMessage,
			})
			continue
		}

		h.Audit.RecordSuccess(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.template",
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
		})
		response.Succeeded = append(response.Succeeded, target.ItemID.String())
	}

	c.JSON(http.StatusOK, response)
}
