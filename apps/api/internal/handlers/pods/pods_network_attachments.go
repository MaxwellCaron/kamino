package pods

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"golang.org/x/sync/errgroup"
)

func findPodNetworkRouterTargetByFlag(targets []podNetworkVMTarget) (*podNetworkVMTarget, *httpx.RequestError) {
	var router *podNetworkVMTarget
	for index := range targets {
		if !targets[index].router {
			continue
		}
		if router != nil {
			return nil, &httpx.RequestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: "pod must contain exactly one router virtual machine",
			}
		}
		router = &targets[index]
	}
	if router == nil {
		return nil, &httpx.RequestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "pod must contain exactly one router virtual machine",
		}
	}
	return router, nil
}

func buildRouterCloudInitConfigForProfile(
	networkNumber int32,
	profileKey string,
	target podCloneTarget,
) (*clonedRouterCloudInitConfig, error) {
	storage := strings.TrimSpace(target.CloudInitStorage)
	if storage == "" {
		return nil, fmt.Errorf("router cloud-init storage is required")
	}

	var userPattern, networkFile string
	switch profileKey {
	case podnetwork.ProfileLANDMZRouterV1:
		userPattern = target.LANDMZUserFilePattern()
		networkFile = target.LANDMZNetworkFile()
	case podnetwork.ProfileLANRouterV1:
		userPattern = target.CloudInitUserFilePattern()
		networkFile = target.CloudInitNetworkFile()
	default:
		return nil, fmt.Errorf("unsupported network profile %q", profileKey)
	}

	userFile, err := formatClonedRouterCloudInitFile(userPattern, networkNumber)
	if err != nil {
		return nil, fmt.Errorf("build router cloud-init user-data filename: %w", err)
	}
	if err := validateStaticCloudInitNetworkFile(networkFile); err != nil {
		return nil, err
	}

	return &clonedRouterCloudInitConfig{
		Storage:     storage,
		UserFile:    userFile,
		NetworkFile: networkFile,
	}, nil
}

func validateStaticCloudInitNetworkFile(filename string) error {
	if strings.Contains(filename, routerCloudInitNetworkPlaceholder) {
		return fmt.Errorf("router cloud-init network-config filename must not contain %s", routerCloudInitNetworkPlaceholder)
	}
	return proxmox.ValidateCloudInitSnippetFilename(filename)
}

func (h *PodsHandler) verifyVMNetworkAttachment(
	ctx context.Context,
	node string,
	vmid int,
	device string,
	expectedBridge string,
	expectedTag *int,
) *httpx.RequestError {
	config, err := h.PX.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return &httpx.RequestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to verify configured network attachment",
			Operation:   "verify vm network attachment",
			Err:         err,
		}
	}

	for _, network := range config.Networks {
		if network.Device != device {
			continue
		}
		if strings.TrimSpace(network.Bridge) != expectedBridge {
			return &httpx.RequestError{
				Status: http.StatusBadGateway,
				UserMessage: fmt.Sprintf(
					"network interface %s has bridge %q, expected %q",
					device, network.Bridge, expectedBridge,
				),
			}
		}
		if expectedTag == nil {
			if network.VLANTag != nil {
				return &httpx.RequestError{
					Status: http.StatusBadGateway,
					UserMessage: fmt.Sprintf(
						"network interface %s must not carry an inner VLAN tag, found %d",
						device, *network.VLANTag,
					),
				}
			}
			return nil
		}
		if network.VLANTag == nil {
			return &httpx.RequestError{
				Status: http.StatusBadGateway,
				UserMessage: fmt.Sprintf(
					"network interface %s is missing its inner VLAN tag %d",
					device, *expectedTag,
				),
			}
		}
		if *network.VLANTag != *expectedTag {
			return &httpx.RequestError{
				Status: http.StatusBadGateway,
				UserMessage: fmt.Sprintf(
					"network interface %s has inner VLAN tag %d, expected %d",
					device, *network.VLANTag, *expectedTag,
				),
			}
		}
		return nil
	}

	return &httpx.RequestError{
		Status:      http.StatusBadGateway,
		UserMessage: fmt.Sprintf("network interface %s is missing", device),
	}
}

func (h *PodsHandler) routerHasManagedNIC(ctx context.Context, node string, vmid int, device string) (bool, *httpx.RequestError) {
	config, err := h.PX.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return false, &httpx.RequestError{
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

// removeRouterNetworkDeviceIfPresent idempotently removes a router NIC; a missing device is a no-op.
func (h *PodsHandler) removeRouterNetworkDeviceIfPresent(ctx context.Context, node string, vmid int, device string) *httpx.RequestError {
	hasDevice, reqErr := h.routerHasManagedNIC(ctx, node, vmid, device)
	if reqErr != nil {
		return reqErr
	}
	if !hasDevice {
		return nil
	}
	if err := h.PX.DeleteVMNetworkDevice(ctx, node, vmid, device); err != nil {
		return &httpx.RequestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to remove unused router network interface",
			Operation:   "delete cloned router " + device,
			Err:         err,
		}
	}
	return nil
}

func (h *PodsHandler) configureProfileNetworkAttachments(
	ctx context.Context,
	cloneTarget podCloneTarget,
	profileKey string,
	networkNumber int32,
	targets []podNetworkVMTarget,
	segmentByTarget map[string]string,
) *httpx.RequestError {
	if h.NetworkCatalog == nil {
		return &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "pod network catalog is not configured",
		}
	}

	router, reqErr := findPodNetworkRouterTargetByFlag(targets)
	if reqErr != nil {
		return reqErr
	}

	profile, err := h.NetworkCatalog.Profile(profileKey)
	if err != nil {
		return &httpx.RequestError{Status: http.StatusUnprocessableEntity, UserMessage: err.Error()}
	}
	// Router templates share net0/net1; the additional NIC is needed only by profiles that declare it.
	if !profile.HasRouterDevice("net2") {
		if reqErr := h.removeRouterNetworkDeviceIfPresent(ctx, router.clone.TargetNode, router.clone.VMID, "net2"); reqErr != nil {
			return reqErr
		}
	} else {
		hasNet2, reqErr := h.routerHasManagedNIC(ctx, router.clone.TargetNode, router.clone.VMID, "net2")
		if reqErr != nil {
			return reqErr
		}
		if !hasNet2 {
			return &httpx.RequestError{Status: http.StatusUnprocessableEntity, UserMessage: fmt.Sprintf("router template must expose net2 for the %s profile", profile.Label)}
		}
	}

	routerAttachments, err := h.NetworkCatalog.ResolveRouterAttachments(cloneTarget.Network(), profileKey, networkNumber)
	if err != nil {
		return &httpx.RequestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: err.Error(),
		}
	}

	// The uplink is set from the target, not inherited from the router template.
	for _, attachment := range routerAttachments {
		bridge := attachment.Bridge
		if err := h.PX.SetVMNetworkAttachment(ctx, router.clone.TargetNode, router.clone.VMID, attachment.Device, proxmox.NetworkAttachment{
			Bridge:   bridge,
			VLANTag:  attachment.VMVLANTag,
			Firewall: true,
		}); err != nil {
			return &httpx.RequestError{
				Status:      http.StatusBadGateway,
				UserMessage: "failed to configure cloned router network",
				Operation:   "set router network attachment",
				Err:         err,
			}
		}
		if reqErr := h.verifyVMNetworkAttachment(ctx, router.clone.TargetNode, router.clone.VMID, attachment.Device, bridge, attachment.VMVLANTag); reqErr != nil {
			return reqErr
		}
	}

	group, gctx := errgroup.WithContext(ctx)
	group.SetLimit(h.vmOperationConcurrencyLimit())
	for _, target := range targets {
		if target.router {
			continue
		}
		target := target
		segmentKey := segmentByTarget[target.name]
		if segmentKey == "" {
			segmentKey, err = h.NetworkCatalog.DefaultWorkloadSegment(profileKey)
			if err != nil {
				return &httpx.RequestError{
					Status:      http.StatusUnprocessableEntity,
					UserMessage: err.Error(),
				}
			}
		}

		attachment, err := h.NetworkCatalog.ResolveWorkloadAttachment(cloneTarget.Network(), profileKey, networkNumber, segmentKey)
		if err != nil {
			return &httpx.RequestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: err.Error(),
			}
		}

		group.Go(func() error {
			if err := h.PX.SetVMNetworkAttachment(gctx, target.clone.TargetNode, target.clone.VMID, attachment.Device, proxmox.NetworkAttachment{
				Bridge:   attachment.VNetName,
				VLANTag:  attachment.VMVLANTag,
				Firewall: true,
			}); err != nil {
				return err
			}
			if reqErr := h.verifyVMNetworkAttachment(gctx, target.clone.TargetNode, target.clone.VMID, attachment.Device, attachment.VNetName, attachment.VMVLANTag); reqErr != nil {
				return reqErr
			}
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		if reqErr, ok := err.(*httpx.RequestError); ok {
			return reqErr
		}
		return &httpx.RequestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to configure cloned pod networks",
			Operation:   "set workload network attachments",
			Err:         err,
		}
	}

	return nil
}
