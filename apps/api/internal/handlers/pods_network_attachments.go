package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
	"golang.org/x/sync/errgroup"
)

func (h *PodsHandler) routerWANBridge(ctx context.Context, node string, vmid int) (string, *requestError) {
	config, err := h.PX.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return "", &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to load router network configuration",
			Operation:   "load router WAN bridge",
			Err:         err,
		}
	}

	for _, network := range config.Networks {
		if network.Device == "net0" {
			bridge := strings.TrimSpace(network.Bridge)
			if bridge == "" {
				return "", &requestError{
					Status:      http.StatusUnprocessableEntity,
					UserMessage: "router template net0 is missing a WAN bridge",
				}
			}
			return bridge, nil
		}
	}

	return "", &requestError{
		Status:      http.StatusUnprocessableEntity,
		UserMessage: "router template is missing net0",
	}
}

func (h *PodsHandler) routerHasManagedNIC(ctx context.Context, node string, vmid int, device string) (bool, *requestError) {
	config, err := h.PX.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return false, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to load router network configuration",
			Operation:   "load router hardware config",
			Err:         err,
		}
	}
	for _, network := range config.Networks {
		if network.Device == device {
			return true, nil
		}
	}
	return false, nil
}

func (h *PodsHandler) configureProfileNetworkAttachments(
	ctx context.Context,
	profileKey string,
	networkNumber int32,
	targets []podNetworkVMTarget,
	segmentByTarget map[string]string,
) *requestError {
	if h.NetworkCatalog == nil {
		return &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "pod network catalog is not configured",
		}
	}

	router, reqErr := findPodNetworkRouterTargetByFlag(targets)
	if reqErr != nil {
		return reqErr
	}

	wanBridge, reqErr := h.routerWANBridge(ctx, router.clone.TargetNode, router.clone.VMID)
	if reqErr != nil {
		return reqErr
	}

	switch profileKey {
	case podnetwork.ProfileLANRouterV1:
		hasNet2, reqErr := h.routerHasManagedNIC(ctx, router.clone.TargetNode, router.clone.VMID, "net2")
		if reqErr != nil {
			return reqErr
		}
		if hasNet2 {
			if err := h.PX.DeleteVMNetworkDevice(ctx, router.clone.TargetNode, router.clone.VMID, "net2"); err != nil {
				return &requestError{
					Status:      http.StatusBadGateway,
					UserMessage: "failed to remove unused router network interface",
					Operation:   "delete cloned router net2",
					Err:         err,
				}
			}
		}
	case podnetwork.ProfileLANDMZRouterV1:
		hasNet2, reqErr := h.routerHasManagedNIC(ctx, router.clone.TargetNode, router.clone.VMID, "net2")
		if reqErr != nil {
			return reqErr
		}
		if !hasNet2 {
			return &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: "router template must expose net2 for the LAN + DMZ Router profile",
			}
		}
	}

	routerAttachments, err := h.NetworkCatalog.ResolveRouterAttachments(profileKey, networkNumber, wanBridge)
	if err != nil {
		return &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: err.Error(),
		}
	}

	for _, attachment := range routerAttachments {
		if err := h.PX.SetVMNetworkAttachment(ctx, router.clone.TargetNode, router.clone.VMID, attachment.Device, proxmox.NetworkAttachment{
			Bridge:   attachment.Bridge,
			VLANTag:  attachment.VMVLANTag,
			Firewall: true,
		}); err != nil {
			return &requestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to configure cloned router network",
				Operation:   "set router network attachment",
				Err:         err,
			}
		}
	}

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(publishCloneConcurrency)
	for _, target := range targets {
		if target.router {
			continue
		}
		target := target
		segmentKey := segmentByTarget[target.name]
		if segmentKey == "" {
			segmentKey, err = h.NetworkCatalog.DefaultWorkloadSegment(profileKey)
			if err != nil {
				return &requestError{
					Status:      http.StatusUnprocessableEntity,
					UserMessage: err.Error(),
				}
			}
		}

		attachment, err := h.NetworkCatalog.ResolveWorkloadAttachment(profileKey, networkNumber, segmentKey)
		if err != nil {
			return &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: err.Error(),
			}
		}

		group.Go(func() error {
			return h.PX.SetVMNetworkAttachment(gctx, target.clone.TargetNode, target.clone.VMID, attachment.Device, proxmox.NetworkAttachment{
				Bridge:   attachment.VNetName,
				VLANTag:  attachment.VMVLANTag,
				Firewall: true,
			})
		})
	}

	if err := group.Wait(); err != nil {
		return &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to configure cloned pod networks",
			Operation:   "set workload network attachments",
			Err:         err,
		}
	}

	return nil
}

func findPodNetworkRouterTargetByFlag(targets []podNetworkVMTarget) (*podNetworkVMTarget, *requestError) {
	var router *podNetworkVMTarget
	for index := range targets {
		if !targets[index].router {
			continue
		}
		if router != nil {
			return nil, &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: "pod must contain exactly one router virtual machine",
			}
		}
		router = &targets[index]
	}
	if router == nil {
		return nil, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "pod must contain exactly one router virtual machine",
		}
	}
	return router, nil
}

func buildRouterCloudInitConfigForProfile(
	networkNumber int32,
	profileKey string,
	config PodRouterCloneConfig,
) (*clonedRouterCloudInitConfig, error) {
	switch profileKey {
	case podnetwork.ProfileLANDMZRouterV1:
		storage := strings.TrimSpace(config.CloudInitStorage)
		if storage == "" {
			return nil, fmt.Errorf("router cloud-init storage is required")
		}
		userFile, err := formatClonedRouterCloudInitFile(config.LANDMZCloudInitUserFilePattern, networkNumber)
		if err != nil {
			return nil, fmt.Errorf("build DMZ/LAN router cloud-init user-data filename: %w", err)
		}
		networkFile := strings.TrimSpace(config.LANDMZCloudInitNetworkFile)
		if err := validateStaticCloudInitNetworkFile(networkFile); err != nil {
			return nil, err
		}
		return &clonedRouterCloudInitConfig{
			Storage:     storage,
			UserFile:    userFile,
			NetworkFile: networkFile,
		}, nil
	case podnetwork.ProfileLANRouterV1:
		return buildClonedRouterCloudInitConfig(networkNumber, config)
	default:
		return nil, fmt.Errorf("unsupported network profile %q", profileKey)
	}
}

func validateStaticCloudInitNetworkFile(filename string) error {
	if strings.Contains(filename, routerCloudInitNetworkPlaceholder) {
		return fmt.Errorf("router cloud-init network-config filename must not contain %s", routerCloudInitNetworkPlaceholder)
	}
	return routerconfig.ValidateCloudInitSnippetFilename(filename)
}
