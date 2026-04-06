package handlers

import (
	"fmt"
	"net/http"

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

type createVMRequest struct {
	Node     string `json:"node" binding:"required"`
	VMID     int    `json:"vmid" binding:"required"`
	Name     string `json:"name" binding:"required"`
	Pool     string `json:"pool"`
	OSType   string `json:"ostype"`
	ISO      string `json:"iso"`
	BIOS     string `json:"bios"`
	Machine  string `json:"machine"`
	Sockets  int    `json:"sockets"`
	Cores    int    `json:"cores"`
	CPUType  string `json:"cpu_type"`
	NUMA     bool   `json:"numa"`
	Memory   int    `json:"memory"`
	Balloon  int    `json:"balloon"`
	Storage  string `json:"storage"`
	DiskSize int    `json:"disk_size"`
	Bridge   string `json:"bridge"`
	NetModel string `json:"net_model"`
	VLANTag  int    `json:"vlan_tag"`
	Firewall bool   `json:"firewall"`
}

// CreateVM creates a new virtual machine.
// POST /api/v1/vms
func (h *VMCreateHandler) CreateVM(c *gin.Context) {
	var req createVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	params := map[string]string{
		"vmid": fmt.Sprintf("%d", req.VMID),
		"name": req.Name,
	}

	if req.Pool != "" {
		params["pool"] = req.Pool
	}
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
	if req.NUMA {
		params["numa"] = "1"
	}
	if req.Memory > 0 {
		params["memory"] = fmt.Sprintf("%d", req.Memory)
	}
	if req.Balloon > 0 {
		params["balloon"] = fmt.Sprintf("%d", req.Balloon)
	}
	if req.Storage != "" && req.DiskSize > 0 {
		params["scsi0"] = fmt.Sprintf("%s:%d", req.Storage, req.DiskSize)
		params["scsihw"] = "virtio-scsi-single"
	}

	// Network
	net := req.NetModel
	if net == "" {
		net = "virtio"
	}
	netParts := net
	if req.Bridge != "" {
		netParts += ",bridge=" + req.Bridge
	}
	if req.Firewall {
		netParts += ",firewall=1"
	}
	if req.VLANTag > 0 {
		netParts += fmt.Sprintf(",tag=%d", req.VLANTag)
	}
	params["net0"] = netParts

	taskID, err := h.PX.CreateVM(c.Request.Context(), req.Node, params)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to create VM"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"task_id": taskID})
}
