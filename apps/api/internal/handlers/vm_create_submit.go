package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type networkInterface struct {
	Bridge   string `json:"bridge"`
	Model    string `json:"model"`
	VLANTag  int    `json:"vlan_tag"`
	Firewall bool   `json:"firewall"`
}

type createVMRequest struct {
	TargetFolderID string             `json:"target_folder_id" binding:"required"`
	Node           string             `json:"node"`
	VMID           int                `json:"vmid"`
	Name           string             `json:"name" binding:"required"`
	OSType         string             `json:"ostype"`
	ISO            string             `json:"iso"`
	BIOS           string             `json:"bios"`
	Machine        string             `json:"machine"`
	SCSI           string             `json:"scsi"`
	Sockets        int                `json:"sockets"`
	Cores          int                `json:"cores"`
	CPUType        string             `json:"cpu_type"`
	Memory         int                `json:"memory"`
	Balloon        int                `json:"balloon"`
	Storage        string             `json:"storage"`
	DiskSize       int                `json:"disk_size"`
	Networks       []networkInterface `json:"networks"`
}

func normalizeMachineType(machine string) string {
	switch strings.TrimSpace(machine) {
	case "", "i440fx":
		return "pc"
	default:
		return machine
	}
}

// CreateVM creates a new virtual machine.
// POST /api/v1/vms
func (h *VMCreateHandler) CreateVM(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	var req createVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	req.Name = names.Normalize(req.Name)
	if err := names.ValidateVM(req.Name); err != nil {
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate vm name", err)
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

	isManager, err := h.Authz.IsManager(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to determine management permissions", "check vm create management permission", err)
		return
	}
	if !isManager {
		scopedVNetName, scoped, err := personalPodNetworkScope(
			c.Request.Context(),
			h.DB,
			h.PersonalPodVNetPrefix,
			h.PersonalPodVLANBase,
			targetFolderID,
		)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to determine personal pod network scope", "resolve vm create network scope", err)
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

	placement, err := h.Service.ResolveFolderPlacement(c.Request.Context(), targetFolderID)
	if err != nil {
		writeInventoryError(c, err)
		return
	}
	reservation, err := h.Service.ReserveFolderVMCapacity(c.Request.Context(), targetFolderID, 1, "vm_create")
	if err != nil {
		writeInventoryError(c, err)
		return
	}
	if reservation != nil {
		defer reservation.Release(c.Request.Context())
	}

	params := map[string]string{
		"name": req.Name,
	}
	upstreamUUID := uuid.New()
	params["smbios1"] = fmt.Sprintf("uuid=%s", upstreamUUID.String())

	if req.OSType != "" {
		params["ostype"] = req.OSType
	}
	if req.ISO != "" {
		params["ide2"] = req.ISO + ",media=cdrom"
	}
	if req.BIOS != "" {
		params["bios"] = req.BIOS
	}
	if req.Machine != "" {
		params["machine"] = normalizeMachineType(req.Machine)
	}
	if req.Sockets > 0 {
		params["sockets"] = fmt.Sprintf("%d", req.Sockets)
	}
	if req.Cores > 0 {
		params["cores"] = fmt.Sprintf("%d", req.Cores)
	}
	if req.CPUType != "" {
		params["cpu"] = req.CPUType
	}
	if req.Memory > 0 {
		params["memory"] = fmt.Sprintf("%d", req.Memory*1024)
	}
	if req.Balloon > 0 {
		params["balloon"] = fmt.Sprintf("%d", req.Balloon*1024)
	}
	if req.Storage != "" && req.DiskSize > 0 {
		params["scsi0"] = fmt.Sprintf("%s:%d", req.Storage, req.DiskSize)
		if req.SCSI != "" {
			params["scsihw"] = req.SCSI
		} else {
			params["scsihw"] = "virtio-scsi-single"
		}
	}

	// Networks
	for i, iface := range req.Networks {
		model := iface.Model
		if model == "" {
			model = "virtio"
		}
		netStr := model
		if iface.Bridge != "" {
			netStr += ",bridge=" + iface.Bridge
		}
		if iface.Firewall {
			netStr += ",firewall=1"
		}
		if iface.VLANTag > 0 {
			netStr += fmt.Sprintf(",tag=%d", iface.VLANTag)
		}
		params[fmt.Sprintf("net%d", i)] = netStr
	}

	targetNode := req.Node
	if targetNode == "" {
		optimalNode, err := h.PX.GetOptimalNode(c.Request.Context())
		if err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to resolve optimal node", "resolve optimal node", err)
			return
		}
		targetNode = optimalNode.Node
	}

	vmid, err := runWithAvailableVMID(c.Request.Context(), h.Allocator, req.VMID, func(vmid int) error {
		params["vmid"] = fmt.Sprintf("%d", vmid)
		return h.PX.CreateVM(c.Request.Context(), targetNode, params)
	})
	switch {
	case err == nil:
	case isVMIDUnavailable(err):
		writeConflict(c, "VM ID is already in use")
		return
	default:
		writeLoggedError(c, http.StatusBadGateway, "failed to create VM", "create proxmox vm", err)
		return
	}

	if err := h.PX.SyncVMPoolMembership(c.Request.Context(), targetNode, vmid, placement.PoolID, placement.Path); err != nil {
		cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, vmid, "created VM pool sync failure")
		writeLoggedError(c, http.StatusBadGateway, "failed to sync VM pool membership", "sync vm pool membership", err)
		return
	}

	itemID, err := h.Importer.SyncVM(
		c.Request.Context(),
		placement.FolderID,
		targetNode,
		vmid,
		proxmox.GuestQEMU,
	)
	if err != nil {
		cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, vmid, "created VM inventory sync failure")
		writeLoggedError(c, http.StatusInternalServerError, "vm created in Proxmox but failed to sync inventory metadata", "sync created vm inventory metadata", err)
		return
	}

	h.Service.NotifyInventoryChanged(c.Request.Context(), itemID)

	item, err := h.Service.GetInventoryItemWithPermissions(
		c.Request.Context(),
		principalID,
		itemID,
	)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "vm created in Proxmox but failed to load inventory item", "load created vm inventory item", err)
		return
	}

	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "vm.create",
		TargetKind:       "vm",
		InventoryItemID:  &itemID,
		Metadata:         map[string]any{"vmid": vmid, "node": targetNode},
	})
	c.JSON(http.StatusOK, vmMutationResponse{
		OK:     true,
		VMID:   vmid,
		ItemID: itemID,
		Item:   buildInventoryItem(item),
	})
}
