package handlers

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type clonedVM struct {
	SourceItemID    uuid.UUID
	InventoryItemID uuid.UUID
	TargetNode      string
	VMID            int
}

// cloneVMOptions holds concurrency/cleanup hooks for VM cloning.
type cloneVMOptions struct {
	batch     *vmidalloc.Batch
	onStarted func(node string, vmid int)
	onSynced  func(clonedVM)
}

// cloneVMIntoFolder authorizes the source, clones it into the folder, stamps a
// fresh identity, syncs pool membership, and imports it into the inventory.
func (h *PodsHandler) cloneVMIntoFolder(
	ctx context.Context,
	principalID uuid.UUID,
	sourceItemID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	name string,
	full bool,
	opts cloneVMOptions,
) (clonedVM, *requestError) {
	source, reqErr := resolveVerifiedVMItemPermission(
		ctx,
		h.Authz,
		h.PX,
		principalID,
		sourceItemID,
		authorization.CloneVM,
		true,
	)
	if reqErr != nil {
		return clonedVM{}, reqErr
	}

	return h.cloneVerifiedVMIntoFolder(ctx, source, sourceItemID, placement, targetNode, name, full, opts)
}

func (h *PodsHandler) cloneVerifiedVMIntoFolder(
	ctx context.Context,
	source verifiedVMTarget,
	sourceItemID uuid.UUID,
	placement inventory.FolderPlacement,
	targetNode string,
	name string,
	full bool,
	opts cloneVMOptions,
) (clonedVM, *requestError) {
	task, newID, reqErr := h.startVMClone(ctx, source, targetNode, name, full, opts.batch)
	if reqErr != nil {
		return clonedVM{}, reqErr
	}
	if opts.onStarted != nil {
		opts.onStarted(targetNode, newID)
	}

	if err := h.PX.WaitForTask(ctx, task.Node, task.UPID); err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to clone VM",
			Operation:   "clone pod VM",
			Err:         err,
		}
	}
	if err := h.PX.SetVMUpstreamUUID(ctx, targetNode, newID, uuid.New()); err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to assign clone identity",
			Operation:   "assign pod clone identity",
			Err:         err,
		}
	}
	if err := h.PX.SyncVMPoolMembership(ctx, targetNode, newID, placement.PoolID, placement.Path); err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to sync VM pool membership",
			Operation:   "sync pod clone pool membership",
			Err:         err,
		}
	}

	clonedItemID, err := h.Importer.SyncVM(ctx, placement.FolderID, targetNode, newID, proxmox.GuestQEMU)
	if err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "vm cloned in Proxmox but failed to sync inventory metadata",
			Operation:   "sync pod clone inventory metadata",
			Err:         err,
		}
	}

	clone := clonedVM{
		SourceItemID:    sourceItemID,
		InventoryItemID: clonedItemID,
		TargetNode:      targetNode,
		VMID:            newID,
	}
	if opts.onSynced != nil {
		opts.onSynced(clone)
	}

	return clone, nil
}

// startVMClone claims a VMID via batch and starts the clone task.
func (h *PodsHandler) startVMClone(
	ctx context.Context,
	source verifiedVMTarget,
	targetNode string,
	name string,
	full bool,
	batch *vmidalloc.Batch,
) (proxmox.CloneTask, int, *requestError) {
	var task proxmox.CloneTask
	newID, err := batch.Claim(ctx, func(vmid int) error {
		var cloneErr error
		task, cloneErr = h.PX.StartCloneVM(ctx, source.Node, source.VMID, vmid, name, full, targetNode)
		return cloneErr
	})
	if err != nil {
		if vmidalloc.IsRangeExhausted(err) {
			return proxmox.CloneTask{}, 0, &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "no available VMID in the configured workflow range",
				Operation:   "allocate pod clone vmid",
				Err:         err,
			}
		}
		return proxmox.CloneTask{}, 0, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to clone VM",
			Operation:   "start pod clone",
			Err:         err,
		}
	}
	return task, newID, nil
}

func (h *PodsHandler) convertCloneToTemplate(ctx context.Context, clone clonedVM) *requestError {
	if err := h.PX.ConvertToTemplate(ctx, clone.TargetNode, clone.VMID); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to convert Pod VM clone to Pod Template VM",
			Operation:   "convert published pod VM clone to Pod Template VM",
			Err:         err,
		}
	}

	if err := h.Service.UpdateInventoryVMIsTemplate(ctx, clone.InventoryItemID); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "Pod VM clone converted in Proxmox but failed to update inventory metadata",
			Operation:   "update published pod VM clone Pod Template VM state",
			Err:         err,
		}
	}

	h.Service.NotifyInventoryChanged(ctx, clone.InventoryItemID)

	return nil
}

// cleanupPublishClones best-effort deletes clones from a failed publish, using a
// fresh context since the publish context is usually already cancelled.
func (h *PodsHandler) cleanupPublishClones(created map[int]clonedVM) {
	if len(created) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for _, clone := range created {
		if err := h.PX.DeleteVM(ctx, proxmox.GuestQEMU, clone.TargetNode, clone.VMID); err != nil {
			log.Printf("publish cleanup: failed to delete Proxmox VM %d on %s: %v", clone.VMID, clone.TargetNode, err)
		}
		if clone.InventoryItemID != uuid.Nil {
			if err := h.Service.DeleteInventoryVM(ctx, clone.InventoryItemID); err != nil {
				log.Printf("publish cleanup: failed to delete inventory item %s: %v", clone.InventoryItemID, err)
			}
		}
	}
}

func (h *PodsHandler) cleanupPublishedPodTemplates(templateItemIDs []uuid.UUID) {
	if len(templateItemIDs) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	if reqErr := h.deletePublishedPodTemplates(ctx, templateItemIDs); reqErr != nil {
		log.Printf("publish cleanup: failed to delete orphaned Pod Template VMs: %s", reqErr.Error())
	}
}

func (h *PodsHandler) deletePublishedPodTemplates(ctx context.Context, templateItemIDs []uuid.UUID) *requestError {
	q := database.New(h.DB)
	for _, id := range templateItemIDs {
		if id == uuid.Nil || id == h.RouterTemplateItemID {
			continue
		}

		row, err := q.GetProxmoxVMByInventoryItemID(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to load replaced Pod Template VM",
				Operation:   "load replaced published Pod Template VM",
				Err:         err,
			}
		}

		if err := h.deleteClonedPodProxmoxVM(ctx, row.Node, int(row.Vmid)); err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to delete replaced Pod Template VM",
				Operation:   "delete replaced published Pod Template VM",
				Err:         err,
			}
		}
		if err := h.Service.DeleteInventoryVM(ctx, id); err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to delete replaced Pod Template VM metadata",
				Operation:   "delete replaced published Pod Template VM inventory item",
				Err:         err,
			}
		}
	}

	return nil
}

func publishedPodTemplateIDs(vms []normalizedPublishPodVM) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(vms))
	for _, vm := range vms {
		if vm.SourceInventoryItemID != uuid.Nil {
			ids = append(ids, vm.SourceInventoryItemID)
		}
	}
	return ids
}

func newPublishedPodTemplateIDs(
	vms []normalizedPublishPodVM,
	existingVMs []database.ListPublishedPodVMsByPodIDsRow,
) []uuid.UUID {
	existing := make(map[uuid.UUID]struct{}, len(existingVMs))
	for _, vm := range existingVMs {
		existing[vm.SourceInventoryItemID] = struct{}{}
	}

	ids := make([]uuid.UUID, 0, len(vms))
	for _, vm := range vms {
		if vm.SourceInventoryItemID == uuid.Nil {
			continue
		}
		if _, ok := existing[vm.SourceInventoryItemID]; ok {
			continue
		}
		ids = append(ids, vm.SourceInventoryItemID)
	}
	return ids
}
