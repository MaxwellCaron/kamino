package handlers

import (
	"fmt"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

// VMCreateHandler handles VM creation and related metadata endpoints.
type VMCreateHandler struct {
	PX *proxmox.Client
}

// GetNodes returns all cluster nodes.
// GET /api/v1/proxmox/nodes
func (h *VMCreateHandler) GetNodes(c *gin.Context) {
	nodes, err := h.PX.GetNodes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch nodes"})
		return
	}
	c.JSON(http.StatusOK, nodes)
}

// GetStorages returns storages for a node.
// GET /api/v1/proxmox/nodes/:node/storages
func (h *VMCreateHandler) GetStorages(c *gin.Context) {
	node := c.Param("node")
	storages, err := h.PX.GetStorages(c.Request.Context(), node)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch storages"})
		return
	}
	c.JSON(http.StatusOK, storages)
}

// GetISOs returns ISO files available on a storage.
// GET /api/v1/proxmox/nodes/:node/storages/:storage/isos
func (h *VMCreateHandler) GetISOs(c *gin.Context) {
	node := c.Param("node")
	storage := c.Param("storage")
	isos, err := h.PX.GetISOs(c.Request.Context(), node, storage)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch ISOs"})
		return
	}
	c.JSON(http.StatusOK, isos)
}

// GetNextVMID returns the next available VMID.
// GET /api/v1/proxmox/nextid
func (h *VMCreateHandler) GetNextVMID(c *gin.Context) {
	id, err := h.PX.GetNextVMID(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch next VMID"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"vmid": id})
}

// ValidateVMID reports whether a VMID is available.
// GET /api/v1/proxmox/vmid/:vmid/validate
func (h *VMCreateHandler) ValidateVMID(c *gin.Context) {
	vmid, err := parseIntParam(c, "vmid")
	if err != nil {
		return
	}

	available, err := h.PX.IsVMIDAvailable(c.Request.Context(), vmid)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to validate VMID"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"valid": available})
}

// GetBridges returns network bridges for a node.
// GET /api/v1/proxmox/nodes/:node/bridges
func (h *VMCreateHandler) GetBridges(c *gin.Context) {
	node := c.Param("node")
	bridges, err := h.PX.GetBridges(c.Request.Context(), node)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch bridges"})
		return
	}
	vnets, err := h.PX.GetVNets(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch vnets"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"bridges": bridges, "vnets": vnets})
}

type networkInterface struct {
	Bridge   string `json:"bridge"`
	Model    string `json:"model"`
	VLANTag  int    `json:"vlan_tag"`
	Firewall bool   `json:"firewall"`
}

type createVMRequest struct {
	Node     string             `json:"node" binding:"required"`
	VMID     int                `json:"vmid"`
	Name     string             `json:"name" binding:"required"`
	OSType   string             `json:"ostype"`
	ISO      string             `json:"iso"`
	BIOS     string             `json:"bios"`
	Machine  string             `json:"machine"`
	SCSI     string             `json:"scsi"`
	Sockets  int                `json:"sockets"`
	Cores    int                `json:"cores"`
	CPUType  string             `json:"cpu_type"`
	Memory   int                `json:"memory"`
	Balloon  int                `json:"balloon"`
	Storage  string             `json:"storage"`
	DiskSize int                `json:"disk_size"`
	Networks []networkInterface `json:"networks"`
}

// CreateVM creates a new virtual machine.
// POST /api/v1/vms
func (h *VMCreateHandler) CreateVM(c *gin.Context) {
	var req createVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Name = names.Normalize(req.Name)
	if err := names.ValidateVM(req.Name); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	params := map[string]string{
		"name": req.Name,
	}

	vmid := req.VMID
	if vmid <= 0 {
		nextID, err := h.PX.GetNextVMID(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch next VMID"})
			return
		}
		vmid = nextID
	}

	available, err := h.PX.IsVMIDAvailable(c.Request.Context(), vmid)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to validate VMID"})
		return
	}
	if !available {
		c.JSON(http.StatusConflict, gin.H{"error": "VM ID is already in use"})
		return
	}

	params["vmid"] = fmt.Sprintf("%d", vmid)

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
		params["machine"] = req.Machine
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

	if err := h.PX.CreateVM(c.Request.Context(), req.Node, params); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "vmid": vmid})
}
