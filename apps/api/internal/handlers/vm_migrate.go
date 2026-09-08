package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

var (
	errVMMigrationActionInProgress = errors.New("another action is already in progress for this VM")
	errVMMigrationInventorySync    = errors.New("inventory sync failed")
	errVMMigrationSameNode         = errors.New("VM is already on target node")
	errVMMigrationUnsupported      = errors.New("not supported for containers")
)

type migrateVMsRequest struct {
	ItemIDs []string `json:"item_ids" binding:"required,min=1"`
	Target  string   `json:"target" binding:"required"`
}

// MigrateVMs migrates one or more QEMU guests to a managed Proxmox node.
// POST /api/v1/inventory/vms/migrate
func (h *VMHandler) MigrateVMs(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	var req migrateVMsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	req.Target = strings.TrimSpace(req.Target)
	if req.Target == "" {
		writeInvalidRequest(c, "target is required")
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
		authorization.CreateVM,
		true,
		false,
	)

	operationLimit := 2
	acquireOperation := func(context.Context) (func(), error) { return func() {}, nil }
	if h.Actions != nil {
		operationLimit = h.Actions.OperationConcurrency()
		acquireOperation = h.Actions.AcquireOperationSlot
	}

	results := runBoundedActions(
		c.Request.Context(),
		operationLimit,
		targets,
		func(ctx context.Context, _ int, target verifiedVMTarget) error {
			if target.GuestType != proxmox.GuestQEMU {
				return errVMMigrationUnsupported
			}
			if target.Node == req.Target {
				return errVMMigrationSameNode
			}

			release, err := acquireOperation(ctx)
			if err != nil {
				return fmt.Errorf("acquire VM operation slot: %w", err)
			}
			defer release()

			actionErr, claimed := h.runClaimedBulkVMAction(
				ctx,
				target,
				"migrate_vm",
				principalID,
				func() error {
					if err := h.PX.MigrateVM(ctx, target.GuestType, target.Node, target.VMID, req.Target); err != nil {
						return err
					}
					if err := h.Service.UpdateInventoryVMNode(ctx, target.ItemID, req.Target); err != nil {
						return fmt.Errorf("%w: %v", errVMMigrationInventorySync, err)
					}
					h.Service.NotifyInventoryChanged(ctx, target.ItemID)
					return nil
				},
			)
			if !claimed {
				return errVMMigrationActionInProgress
			}
			return actionErr
		},
	)

	for index, result := range results {
		target := targets[index]
		if result.Err != nil {
			errorMessage := migrationErrorMessage(result.Err)
			logRequestError(c, "migrate vm item_id="+target.ItemID.String(), result.Err)
			h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "vm.migrate",
				TargetKind:       "vm",
				InventoryItemID:  &target.ItemID,
				Metadata:         map[string]any{"source_node": target.Node, "target_node": req.Target},
			}, errorMessage)
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: errorMessage,
			})
			continue
		}

		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.migrate",
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
			Metadata:         map[string]any{"source_node": target.Node, "target_node": req.Target},
		})
		response.Succeeded = append(response.Succeeded, target.ItemID.String())
	}

	c.JSON(http.StatusOK, response)
}

func migrationErrorMessage(err error) string {
	switch {
	case errors.Is(err, errVMMigrationActionInProgress):
		return errVMMigrationActionInProgress.Error()
	case errors.Is(err, errVMMigrationInventorySync):
		return errVMMigrationInventorySync.Error()
	case errors.Is(err, errVMMigrationSameNode):
		return errVMMigrationSameNode.Error()
	case errors.Is(err, errVMMigrationUnsupported):
		return errVMMigrationUnsupported.Error()
	default:
		return "migration failed"
	}
}
