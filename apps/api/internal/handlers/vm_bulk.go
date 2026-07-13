package handlers

import (
	"context"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
)

type createSnapshotRequest struct {
	Snapname    string `json:"snapname" binding:"required"`
	Description string `json:"description"`
	VMState     bool   `json:"vmstate"`
}

type bulkVMItemsRequest struct {
	ItemIDs []string `json:"item_ids" binding:"required,min=1"`
}

type bulkVMActionFailure struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

type bulkVMActionResponse struct {
	Succeeded []string              `json:"succeeded"`
	Failed    []bulkVMActionFailure `json:"failed"`
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}

		seen[value] = struct{}{}
		unique = append(unique, value)
	}

	return unique
}

func parseBulkVMItemIDs(rawItemIDs []string) ([]uuid.UUID, error) {
	itemIDs := make([]uuid.UUID, 0, len(rawItemIDs))
	for _, rawItemID := range uniqueStrings(rawItemIDs) {
		itemID, err := uuid.Parse(rawItemID)
		if err != nil {
			return nil, err
		}

		itemIDs = append(itemIDs, itemID)
	}

	return itemIDs, nil
}

func (h *VMHandler) collectVerifiedVMTargets(
	c *gin.Context,
	principalID uuid.UUID,
	itemIDs []uuid.UUID,
	required authorization.Mask,
	lock bool,
) ([]verifiedVMTarget, bulkVMActionResponse) {
	response := bulkVMActionResponse{
		Succeeded: make([]string, 0, len(itemIDs)),
		Failed:    make([]bulkVMActionFailure, 0),
	}
	targets := make([]verifiedVMTarget, 0, len(itemIDs))

	accessByItemID, err := h.Authz.ResolveVMItems(c.Request.Context(), principalID, itemIDs, required, lock)
	if err != nil {
		logRequestError(c, "resolve bulk vm inventory access", err)
		for _, itemID := range itemIDs {
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    itemID.String(),
				Error: "authorization failed",
			})
		}
		return targets, response
	}

	type pendingVerification struct {
		index  int
		itemID uuid.UUID
		record authorization.VMRecord
	}

	pending := make([]pendingVerification, 0, len(itemIDs))
	for _, itemID := range itemIDs {
		access, ok := accessByItemID[itemID]
		switch {
		case !ok:
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    itemID.String(),
				Error: "item not found",
			})
		case !access.Allowed:
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    itemID.String(),
				Error: "forbidden",
			})
		case !access.HasVM:
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    itemID.String(),
				Error: "vm not found",
			})
		default:
			pending = append(pending, pendingVerification{
				index:  len(pending),
				itemID: itemID,
				record: access.Record,
			})
		}
	}

	verifiedTargets := make([]verifiedVMTarget, len(pending))
	verifyErrors := make([]*requestError, len(pending))
	group, groupCtx := errgroup.WithContext(c.Request.Context())
	group.SetLimit(8)
	for _, pendingTarget := range pending {
		pendingTarget := pendingTarget
		group.Go(func() error {
			target, reqErr := verifyVMRecordIdentity(groupCtx, h.PX, pendingTarget.record)
			if reqErr != nil {
				verifyErrors[pendingTarget.index] = reqErr
				return nil
			}

			verifiedTargets[pendingTarget.index] = target
			return nil
		})
	}
	_ = group.Wait()

	for _, pendingTarget := range pending {
		reqErr := verifyErrors[pendingTarget.index]
		if reqErr != nil {
			if reqErr.Err != nil {
				logRequestError(c, reqErr.Operation+" item_id="+pendingTarget.itemID.String(), reqErr.Err)
			}
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    pendingTarget.itemID.String(),
				Error: reqErr.UserMessage,
			})
			continue
		}

		targets = append(targets, verifiedTargets[pendingTarget.index])
	}

	return targets, response
}

// runClaimedBulkVMAction claims target.ItemID for action and invokes fn,
func (h *VMHandler) runClaimedBulkVMAction(
	ctx context.Context,
	target verifiedVMTarget,
	action string,
	principalID uuid.UUID,
	fn func() error,
) (fnErr error, claimed bool) {
	if err := h.Claims.Claim(ctx, target.ItemID, action, principalID, ""); err != nil {
		return nil, false
	}
	defer func() {
		_ = h.Claims.Release(ctx, target.ItemID)
	}()

	return fn(), true
}

func vmActionTarget(target verifiedVMTarget) vmactions.Target {
	return vmactions.Target{
		ItemID:    target.ItemID,
		Node:      target.Node,
		VMID:      target.VMID,
		GuestType: target.GuestType,
	}
}

func writeContainerNotSupported(c *gin.Context) {
	c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "not supported for containers"})
}
