package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

func (h *VMHandler) GetHardware(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}

	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.EditVMHardware, false)
	if !ok {
		return
	}
	if target.GuestType == proxmox.GuestLXC {
		writeContainerNotSupported(c)
		return
	}

	config, err := h.PX.GetVMHardwareConfig(c.Request.Context(), target.Node, target.VMID)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch VM hardware", "fetch vm hardware config", err)
		return
	}

	c.JSON(http.StatusOK, config)
}

type vmNetworkSummaryResponse struct {
	Device string `json:"device,omitempty"`
	Bridge string `json:"bridge"`
}

// GetNetworking returns the current network interface summary for a VM.
// GET /api/v1/inventory/items/:id/vm/networking
func (h *VMHandler) GetNetworking(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}

	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.View, false)
	if !ok {
		return
	}

	var networks []proxmox.VMHardwareNetwork
	var err error
	if target.GuestType == proxmox.GuestLXC {
		networks, err = h.PX.GetLXCNetworks(c.Request.Context(), target.Node, target.VMID)
	} else {
		var config *proxmox.VMHardwareConfig
		config, err = h.PX.GetVMHardwareConfig(c.Request.Context(), target.Node, target.VMID)
		if err == nil {
			networks = config.Networks
		}
	}
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch VM networks", "fetch vm network config", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"networks": summarizeVMHardwareNetworks(networks)})
}

func summarizeVMHardwareNetworks(networks []proxmox.VMHardwareNetwork) []vmNetworkSummaryResponse {
	summaries := make([]vmNetworkSummaryResponse, 0, len(networks))
	for _, network := range networks {
		summaries = append(summaries, vmNetworkSummaryResponse{
			Device: network.Device,
			Bridge: network.Bridge,
		})
	}

	return summaries
}

// UpdateHardware updates editable hardware settings for a VM and refreshes summary metadata.
// PUT /api/v1/inventory/items/:id/vm/hardware
func (h *VMHandler) UpdateHardware(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}

	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.EditVMHardware, true)
	if !ok {
		return
	}
	if target.GuestType == proxmox.GuestLXC {
		writeContainerNotSupported(c)
		return
	}

	var req updateVMHardwareRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	if err := validateVMHardwareRequest(req); err != nil {
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate vm hardware request", err)
		return
	}

	isManager, err := h.Authz.IsManager(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to determine management permissions", "check vm hardware management permission", err)
		return
	}
	if !isManager {
		scopedVNetName, scoped, err := personalPodNetworkScope(
			c.Request.Context(),
			h.DB,
			h.PersonalPodVNetPrefix,
			h.PodLANVLANBase,
			itemID,
		)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to determine personal pod network scope", "resolve vm hardware network scope", err)
			return
		}
		if scoped {
			for _, network := range req.Networks {
				if strings.TrimSpace(network.Bridge) != scopedVNetName {
					c.JSON(http.StatusUnprocessableEntity, gin.H{
						"error": fmt.Sprintf("virtual machines in a personal pod may only use its assigned network %s", scopedVNetName),
					})
					return
				}
			}
		}
	}

	config := proxmox.VMHardwareConfig{
		OSType:   strings.TrimSpace(req.OSType),
		BIOS:     strings.TrimSpace(req.BIOS),
		Machine:  strings.TrimSpace(req.Machine),
		SCSI:     strings.TrimSpace(req.SCSI),
		Sockets:  req.Sockets,
		Cores:    req.Cores,
		CPUType:  strings.TrimSpace(req.CPUType),
		Memory:   req.Memory,
		Balloon:  req.Balloon,
		Storage:  strings.TrimSpace(req.Storage),
		DiskSize: req.DiskSize,
		Networks: make([]proxmox.VMHardwareNetwork, 0, len(req.Networks)),
	}

	for _, network := range req.Networks {
		var vlanTag *int
		if network.VLANTag > 0 {
			value := network.VLANTag
			vlanTag = &value
		}

		config.Networks = append(config.Networks, proxmox.VMHardwareNetwork{
			Device:     strings.TrimSpace(network.Device),
			Bridge:     strings.TrimSpace(network.Bridge),
			Model:      strings.TrimSpace(network.Model),
			VLANTag:    vlanTag,
			Firewall:   network.Firewall,
			MACAddress: strings.TrimSpace(network.MACAddress),
		})
	}

	h.runClaimedVMAction(c, target.ItemID, "update_hardware", principalID, func() bool {
		if err := h.PX.UpdateVMHardware(c.Request.Context(), target.Node, target.VMID, config); err != nil {
			writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "update vm hardware", err)
			return false
		}

		cpuCount := int32(req.Sockets * req.Cores)
		memoryMB := int32(req.Memory * 1024)
		if err := h.Service.UpdateInventoryVMHardwareSummary(
			c.Request.Context(),
			target.ItemID,
			cpuCount,
			memoryMB,
			float64(req.DiskSize),
		); err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "vm hardware updated in Proxmox but failed to refresh inventory metadata", "update vm hardware summary", err)
			return false
		}

		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.hardware.update",
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
		})
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return true
	})
}

func validateVMHardwareRequest(req updateVMHardwareRequest) error {
	if strings.TrimSpace(req.OSType) == "" {
		return fmt.Errorf("ostype is required")
	}
	if strings.TrimSpace(req.BIOS) == "" {
		return fmt.Errorf("bios is required")
	}
	if strings.TrimSpace(req.Machine) == "" {
		return fmt.Errorf("machine is required")
	}
	if strings.TrimSpace(req.SCSI) == "" {
		return fmt.Errorf("scsi is required")
	}
	if strings.TrimSpace(req.CPUType) == "" {
		return fmt.Errorf("cpu_type is required")
	}
	if strings.TrimSpace(req.Storage) == "" {
		return fmt.Errorf("storage is required")
	}
	if req.Sockets < 1 {
		return fmt.Errorf("sockets must be at least 1")
	}
	if req.Cores < 1 {
		return fmt.Errorf("cores must be at least 1")
	}
	if req.Memory < 1 {
		return fmt.Errorf("memory must be at least 1 GB")
	}
	if req.Balloon < 0 {
		return fmt.Errorf("balloon must be 0 GB or higher")
	}
	if req.DiskSize < 1 {
		return fmt.Errorf("disk_size must be at least 1 GB")
	}
	if len(req.Networks) == 0 {
		return fmt.Errorf("at least one network interface is required")
	}
	if len(req.Networks) > 5 {
		return fmt.Errorf("no more than 5 network interfaces are permitted")
	}

	for index, network := range req.Networks {
		if strings.TrimSpace(network.Bridge) == "" {
			return fmt.Errorf("network %d bridge is required", index)
		}
		if strings.TrimSpace(network.Model) == "" {
			return fmt.Errorf("network %d model is required", index)
		}
		if network.VLANTag < 0 || network.VLANTag > 4094 {
			return fmt.Errorf("network %d vlan_tag must be between 1 and 4094", index)
		}
	}

	return nil
}
