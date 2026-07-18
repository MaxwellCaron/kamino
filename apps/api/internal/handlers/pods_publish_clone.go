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
	CloneTask       proxmox.CloneTask
}

// cloneVMOptions holds concurrency/cleanup hooks; exactly one of batch or requestedVMID must be set.
type cloneVMOptions struct {
	batch         *vmidalloc.Batch
	requestedVMID *int
	onStarted     func(clonedVM)
	onSynced      func(clonedVM)
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
	release, err := h.acquireVMOperationSlot(ctx)
	if err != nil {
		return clonedVM{}, &requestError{
			Status:      http.StatusServiceUnavailable,
			UserMessage: "VM operations are busy",
			Operation:   "acquire VM operation slot",
			Err:         err,
		}
	}
	defer release()

	task, newID, reqErr := h.startVMClone(ctx, source, targetNode, name, full, opts)
	if reqErr != nil {
		return clonedVM{}, reqErr
	}

	started := clonedVM{
		SourceItemID: sourceItemID,
		TargetNode:   targetNode,
		VMID:         newID,
		CloneTask:    task,
	}
	if opts.onStarted != nil {
		opts.onStarted(started)
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
		CloneTask:       task,
	}
	if opts.onSynced != nil {
		opts.onSynced(clone)
	}

	return clone, nil
}

// startVMClone allocates a VMID and starts the clone task.
func (h *PodsHandler) startVMClone(
	ctx context.Context,
	source verifiedVMTarget,
	targetNode string,
	name string,
	full bool,
	opts cloneVMOptions,
) (proxmox.CloneTask, int, *requestError) {
	startClone := func(task *proxmox.CloneTask) func(vmid int) error {
		return func(vmid int) error {
			var cloneErr error
			*task, cloneErr = h.PX.StartCloneVM(ctx, source.Node, source.VMID, vmid, name, full, targetNode)
			return cloneErr
		}
	}

	switch {
	case opts.requestedVMID != nil && opts.batch == nil:
		var task proxmox.CloneTask
		newID, err := runWithAvailableVMID(ctx, h.Allocator, *opts.requestedVMID, startClone(&task))
		if err != nil {
			if isVMIDUnavailable(err) {
				return proxmox.CloneTask{}, 0, &requestError{
					Status:      http.StatusConflict,
					UserMessage: errVMIDUnavailable.Error(),
					Operation:   "allocate pod router clone vmid",
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

	case opts.requestedVMID == nil && opts.batch != nil:
		var task proxmox.CloneTask
		newID, err := opts.batch.Claim(ctx, startClone(&task))
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

	default:
		return proxmox.CloneTask{}, 0, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to clone VM",
			Operation:   "start pod clone",
			Err:         errors.New("cloneVMOptions must set exactly one of batch or requestedVMID"),
		}
	}
}

func (h *PodsHandler) convertCloneToTemplate(ctx context.Context, clone clonedVM) *requestError {
	release, err := h.acquireVMOperationSlot(ctx)
	if err != nil {
		return &requestError{
			Status:      http.StatusServiceUnavailable,
			UserMessage: "VM operations are busy",
			Operation:   "acquire VM operation slot for template conversion",
			Err:         err,
		}
	}
	defer release()

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
