package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (h *PodsHandler) cloneTemplateIntoPod(
	ctx context.Context,
	principalID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	spec podCloneSpec,
	opts cloneVMOptions,
) (createPodVMResult, *requestError) {
	item, err := h.Service.GetInventoryItemByID(ctx, spec.TemplateItemID)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return createPodVMResult{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "configured pod template was not found",
			Operation:   "load pod template inventory item",
			Err:         err,
		}
	default:
		return createPodVMResult{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load template",
			Operation:   "load pod template inventory item",
			Err:         err,
		}
	}
	if item.IsTemplate == nil || !*item.IsTemplate {
		return createPodVMResult{}, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "selected VM is not a template",
		}
	}

	clone, reqErr := h.cloneVMIntoFolder(ctx, principalID, spec.TemplateItemID, placement, targetNode, spec.Name, false, opts)
	if reqErr != nil {
		return createPodVMResult{}, reqErr
	}

	if spec.Hardware != nil {
		if err := h.applyCloneHardware(ctx, targetNode, clone.VMID, clone.InventoryItemID, *spec.Hardware); err != nil {
			return createPodVMResult{}, &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: err.Error(),
				Operation:   "apply pod clone hardware",
				Err:         err,
			}
		}
	}

	h.Service.NotifyInventoryChanged(ctx, clone.InventoryItemID)

	clonedItem, err := h.Service.GetInventoryItemWithPermissions(ctx, principalID, clone.InventoryItemID)
	if err != nil {
		return createPodVMResult{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "vm cloned in Proxmox but failed to load inventory item",
			Operation:   "load pod clone inventory item",
			Err:         err,
		}
	}

	return createPodVMResult{
		response: createPodVMResponse{
			TemplateItemID: spec.TemplateItemID,
			VMID:           clone.VMID,
			ItemID:         clone.InventoryItemID,
			Item:           buildInventoryItem(clonedItem),
		},
		target: podNetworkVMTarget{
			name:   spec.Name,
			clone:  clone,
			router: spec.Router,
		},
	}, nil
}

func (h *PodsHandler) resolveCloneTargetNode(ctx context.Context) (string, error) {
	optimalNode, err := h.PX.GetOptimalNode(ctx)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(optimalNode.Node), nil
}

func (h *PodsHandler) applyCloneHardware(
	ctx context.Context,
	node string,
	vmid int,
	itemID uuid.UUID,
	hardware podCloneHardware,
) error {
	config, err := h.PX.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return fmt.Errorf("failed to load cloned VM hardware")
	}

	config.Sockets = 1
	config.Cores = hardware.CPUCount
	config.Memory = hardware.MemoryGB
	if config.Balloon > config.Memory {
		config.Balloon = config.Memory
	}
	if hardware.StorageGB > config.DiskSize {
		config.DiskSize = hardware.StorageGB
	}

	if err := h.PX.UpdateVMHardware(ctx, node, vmid, *config); err != nil {
		return err
	}

	return h.Service.UpdateInventoryVMHardwareSummary(
		ctx,
		itemID,
		int32(config.Sockets*config.Cores),
		int32(config.Memory*1024),
		float64(config.DiskSize),
	)
}
