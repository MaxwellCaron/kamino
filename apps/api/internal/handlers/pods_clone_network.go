package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
)

func (h *PodsHandler) podVNetName(networkNumber int32) string {
	return fmt.Sprintf(
		"%s%d",
		strings.TrimSpace(h.RouterCloneConfig.VNetPrefix),
		h.RouterCloneConfig.LANVLANBase+int(networkNumber),
	)
}

func (h *PodsHandler) clonedPodVNetName(networkNumber int32) string {
	return h.podVNetName(networkNumber)
}

func (h *PodsHandler) podNetworkMetadata(profileKey string, networkNumber int32) (clonedPodNetworkResponse, error) {
	return h.buildPodNetworkMetadata(profileKey, networkNumber)
}

func (h *PodsHandler) clonedPodNetworkMetadata(clone database.ClonedPods) (clonedPodNetworkResponse, error) {
	return h.buildPodNetworkMetadata(clone.NetworkProfileKey, clone.NetworkNumber)
}

func (h *PodsHandler) ensurePodVNetExists(ctx context.Context, vnetName string) *requestError {
	vnets, err := h.PX.GetVNets(ctx)
	if err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to load pod clone networks",
			Operation:   "list pod clone VNets",
			Err:         err,
		}
	}

	for _, vnet := range vnets {
		if vnet.VNet == vnetName {
			return nil
		}
	}

	return &requestError{
		Status:      http.StatusBadGateway,
		UserMessage: "allocated pod clone network is not available in Proxmox",
	}
}

func (h *PodsHandler) ensureClonedPodVNetExists(ctx context.Context, vnetName string) *requestError {
	return h.ensurePodVNetExists(ctx, vnetName)
}

func (h *PodsHandler) waitForPodVMTargetsVisible(
	ctx context.Context,
	targets []podNetworkVMTarget,
) *requestError {
	wanted := make(map[int]struct{}, len(targets))
	for _, target := range targets {
		wanted[target.clone.VMID] = struct{}{}
	}

	check := func() (bool, error) {
		vms, err := h.PX.GetVMs(ctx)
		if err != nil {
			return false, err
		}
		found := make(map[int]struct{}, len(wanted))
		for _, vm := range vms {
			if _, ok := wanted[vm.VMID]; ok {
				found[vm.VMID] = struct{}{}
			}
		}
		return len(found) == len(wanted), nil
	}

	deadline := time.After(30 * time.Second)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		ready, err := check()
		if err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to detect cloned VMs",
				Operation:   "detect cloned VMs in Proxmox",
				Err:         err,
			}
		}
		if ready {
			return nil
		}

		select {
		case <-ctx.Done():
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "clone canceled while waiting for VMs",
				Operation:   "wait for cloned VMs",
				Err:         ctx.Err(),
			}
		case <-deadline:
			return &requestError{
				Status:      http.StatusConflict,
				UserMessage: "cloned VMs were not detected in Proxmox",
			}
		case <-ticker.C:
		}
	}
}

func (h *PodsHandler) waitForClonedVMsVisible(
	ctx context.Context,
	results []clonePublishedVMResult,
) *requestError {
	return h.waitForPodVMTargetsVisible(ctx, podNetworkTargetsFromCloneResults(results))
}

func (h *PodsHandler) waitForPodVMTargetsReady(
	ctx context.Context,
	targets []podNetworkVMTarget,
) *requestError {
	if reqErr := h.waitForPodVMTargetsVisible(ctx, targets); reqErr != nil {
		return reqErr
	}

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(h.podProvisionConcurrencyLimit())
	for _, target := range targets {
		group.Go(func() error {
			if err := h.PX.WaitForVMConfigUnlocked(gctx, target.clone.TargetNode, target.clone.VMID, h.RouterCloneConfig.RouterWaitTimeout); err != nil {
				return fmt.Errorf("wait for VM %d config unlock: %w", target.clone.VMID, err)
			}
			if err := h.PX.WaitForVMStorageReady(gctx, target.clone.TargetNode, target.clone.VMID, h.RouterCloneConfig.RouterWaitTimeout); err != nil {
				return fmt.Errorf("wait for VM %d storage readiness: %w", target.clone.VMID, err)
			}
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "cloned virtual machines were not ready",
			Operation:   "wait for cloned pod VM readiness",
			Err:         err,
		}
	}

	return nil
}

func (h *PodsHandler) waitForClonedVMsReady(
	ctx context.Context,
	results []clonePublishedVMResult,
) *requestError {
	return h.waitForPodVMTargetsReady(ctx, podNetworkTargetsFromCloneResults(results))
}

func (h *PodsHandler) configurePodVNetBridges(
	ctx context.Context,
	vnetName string,
	targets []podNetworkVMTarget,
) *requestError {
	router, reqErr := findPodNetworkRouterTarget(targets)
	if reqErr != nil {
		return reqErr
	}

	if reqErr := h.ensurePodVNetExists(ctx, vnetName); reqErr != nil {
		return reqErr
	}

	if err := h.PX.SetVMNetworkBridge(ctx, router.clone.TargetNode, router.clone.VMID, "net1", vnetName); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to configure cloned router network",
			Operation:   "set cloned router VNet bridge",
			Err:         err,
		}
	}

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(h.podProvisionConcurrencyLimit())
	for _, target := range targets {
		if target.router {
			continue
		}
		target := target
		group.Go(func() error {
			return h.PX.SetVMNetworkBridge(gctx, target.clone.TargetNode, target.clone.VMID, "net0", vnetName)
		})
	}

	if err := group.Wait(); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to configure cloned pod networks",
			Operation:   "set cloned pod VNet bridges",
			Err:         err,
		}
	}

	return nil
}

func (h *PodsHandler) configureClonedPodNetwork(
	ctx context.Context,
	clone database.ClonedPods,
	results []clonePublishedVMResult,
) *requestError {
	if reqErr := h.ensureProfileVNetsExist(ctx, clone.NetworkProfileKey, clone.NetworkNumber); reqErr != nil {
		return reqErr
	}

	segmentByTarget := segmentAssignmentsFromPublishedCloneResults(results)
	return h.configureProfileNetworkAttachments(
		ctx,
		clone.NetworkProfileKey,
		clone.NetworkNumber,
		podNetworkTargetsFromCloneResults(results),
		segmentByTarget,
	)
}

func segmentAssignmentsFromPublishedCloneResults(results []clonePublishedVMResult) map[string]string {
	assignments := make(map[string]string, len(results))
	for _, result := range results {
		if result.router {
			continue
		}
		if result.published.SegmentKey != nil {
			assignments[result.published.Name] = *result.published.SegmentKey
		}
	}
	return assignments
}

func (h *PodsHandler) configurePodRouterCloudInit(
	ctx context.Context,
	cloudInitConfig *clonedRouterCloudInitConfig,
	targets []podNetworkVMTarget,
) *requestError {
	router, reqErr := findPodNetworkRouterTarget(targets)
	if reqErr != nil {
		return reqErr
	}

	status, err := h.PX.GetVMRuntimeStatus(ctx, proxmox.GuestQEMU, router.clone.TargetNode, router.clone.VMID)
	if err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to detect router status",
			Operation:   "detect cloned router runtime status",
			Err:         err,
		}
	}
	if status == "running" {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "router must be stopped before cloud-init configuration",
			Operation:   "verify cloned router stopped",
			Err:         fmt.Errorf("cloned router VM %d is already running", router.clone.VMID),
		}
	}
	if status != "stopped" {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "router must be stopped before cloud-init configuration",
			Operation:   "verify cloned router stopped",
			Err:         fmt.Errorf("cloned router VM %d is in %q state", router.clone.VMID, status),
		}
	}

	if err := h.PX.EnsureVMCloudInitDrive(ctx, router.clone.TargetNode, router.clone.VMID); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "router template is missing a cloud-init drive",
			Operation:   "verify cloned router cloud-init drive",
			Err:         err,
		}
	}
	if err := h.PX.SetVMCloudInitCustom(
		ctx,
		router.clone.TargetNode,
		router.clone.VMID,
		cloudInitConfig.Storage,
		cloudInitConfig.UserFile,
		cloudInitConfig.NetworkFile,
	); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to configure router cloud-init snippets",
			Operation:   "set cloned router cloud-init custom config",
			Err:         err,
		}
	}

	if err := h.PX.StartVM(ctx, proxmox.GuestQEMU, router.clone.TargetNode, router.clone.VMID); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to start router",
			Operation:   "start cloned router",
			Err:         err,
		}
	}
	if err := h.PX.WaitForVMRuntimeStatus(
		ctx,
		proxmox.GuestQEMU,
		router.clone.TargetNode,
		router.clone.VMID,
		"running",
		h.RouterCloneConfig.RouterWaitTimeout,
	); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "router did not reach running state",
			Operation:   "wait for cloned router runtime running",
			Err:         err,
		}
	}

	if h.Notifier != nil {
		if err := h.Notifier.RefreshNow(ctx); err != nil {
			log.Printf("clone router: status refresh after router start failed: %v", err)
		}
	}

	return nil
}

func (h *PodsHandler) configureClonedRouter(
	ctx context.Context,
	clone database.ClonedPods,
	results []clonePublishedVMResult,
) *requestError {
	cloudInitConfig, err := buildRouterCloudInitConfigForProfile(clone.NetworkNumber, clone.NetworkProfileKey, h.RouterCloneConfig)
	if err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to build router cloud-init configuration",
			Operation:   "build cloned router cloud-init configuration",
			Err:         err,
		}
	}

	return h.configurePodRouterCloudInit(ctx, cloudInitConfig, podNetworkTargetsFromCloneResults(results))
}

func (h *PodsHandler) recordReclonedPodVMs(
	ctx context.Context,
	cloneID uuid.UUID,
	results []clonePublishedVMResult,
) *requestError {
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to record cloned pod VMs",
			Operation:   "begin recloned pod tx",
			Err:         err,
		}
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	if err := q.DeleteClonedPodVMs(ctx, cloneID); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to replace cloned pod VMs",
			Operation:   "delete cloned pod VM records",
			Err:         err,
		}
	}

	for _, result := range results {
		if err := q.InsertClonedPodVM(ctx, database.InsertClonedPodVMParams{
			ClonedPodID:      cloneID,
			PublishedPodVmID: result.published.ID,
			InventoryItemID:  result.clone.InventoryItemID,
			SortOrder:        result.published.SortOrder,
		}); err != nil {
			return &requestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to record cloned pod VMs",
				Operation:   "insert recloned pod VM",
				Err:         err,
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to record cloned pod VMs",
			Operation:   "commit recloned pod tx",
			Err:         err,
		}
	}

	return nil
}
