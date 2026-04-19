package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func parseIntParam(c *gin.Context, name string) (int, error) {
	val, err := strconv.Atoi(c.Param(name))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid " + name})
	}
	return val, err
}

// VMHandler handles all VM-related API endpoints (status, power, snapshots, etc.).
type VMHandler struct {
	PX       *proxmox.Client
	Importer *proxmox.InventoryImporter
	Service  *inventory.Service
	Notifier *vmstatus.Notifier
	Authz    *authorization.Service
}

// GetStatuses returns a map of vmid -> status directly from Proxmox.
// GET /api/v1/vms/status
func (h *VMHandler) GetStatuses(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	statuses := map[int]string(nil)
	if h.Notifier != nil {
		statuses = h.Notifier.Current()
	} else {
		vms, err := h.PX.GetVMs(c.Request.Context())
		if err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to fetch VM statuses", "fetch vm statuses", err)
			return
		}

		statuses = make(map[int]string, len(vms))
		for _, vm := range vms {
			statuses[vm.VMID] = vm.Status
		}
	}

	filtered, err := h.Authz.FilterVisibleStatuses(c.Request.Context(), principalID, statuses)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize VM statuses", "filter visible vm statuses", err)
		return
	}

	c.JSON(http.StatusOK, filtered)
}

func (h *VMHandler) waitForObservedVMStatus(vmid int, expectedStatus string) {
	if h.Notifier == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := h.Notifier.RefreshUntilStatus(ctx, vmid, expectedStatus); err != nil {
		log.Printf(
			"vm status catch-up failed for vmid=%d expected=%s: %v",
			vmid,
			expectedStatus,
			err,
		)
	}
}

func (h *VMHandler) waitForVMRemoval(vmid int) {
	if h.Notifier == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := h.Notifier.RefreshUntilAbsent(ctx, vmid); err != nil {
		log.Printf("vm removal catch-up failed for vmid=%d: %v", vmid, err)
	}
}

// StreamEvents pushes VM status updates to connected browsers.
// GET /api/v1/vms/events
func (h *VMHandler) StreamEvents(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	if h.Notifier == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vm events unavailable"})
		return
	}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming unsupported"})
		return
	}

	events, unsubscribe := h.Notifier.Subscribe()
	defer unsubscribe()

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	fmt.Fprint(c.Writer, ": vm status stream connected\n\n")
	flusher.Flush()

	initialStatuses, err := h.Authz.FilterVisibleStatuses(c.Request.Context(), principalID, h.Notifier.Current())
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize VM statuses", "filter initial vm status event", err)
		return
	}

	initialPayload, err := json.Marshal(vmstatus.Event{
		Type:      "vm.statuses.changed",
		Statuses:  initialStatuses,
		Timestamp: time.Now().UTC(),
	})
	if err == nil {
		fmt.Fprint(c.Writer, "event: vm.statuses.changed\n")
		fmt.Fprintf(c.Writer, "data: %s\n\n", initialPayload)
		flusher.Flush()
	}

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}

			filteredStatuses, err := h.Authz.FilterVisibleStatuses(c.Request.Context(), principalID, event.Statuses)
			if err != nil {
				return
			}

			payload, err := json.Marshal(vmstatus.Event{
				Type:      event.Type,
				Statuses:  filteredStatuses,
				Timestamp: event.Timestamp,
			})
			if err != nil {
				continue
			}

			fmt.Fprintf(c.Writer, "event: %s\n", event.Type)
			fmt.Fprintf(c.Writer, "data: %s\n\n", payload)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprint(c.Writer, ": ping\n\n")
			flusher.Flush()
		}
	}
}

// GetResources returns cached resource metrics for a single VM.
// GET /api/v1/inventory/items/:id/vm/resources
func (h *VMHandler) GetResources(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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

	if h.Notifier == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "resource metrics unavailable"})
		return
	}

	resources, ok := h.Notifier.Resources(target.VMID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "no resource data available for this VM"})
		return
	}

	c.JSON(http.StatusOK, resources)
}

type createSnapshotRequest struct {
	Snapname    string `json:"snapname" binding:"required"`
	Description string `json:"description"`
	VMState     bool   `json:"vmstate"`
}

// CreateSnapshot creates a snapshot of a VM and waits for the Proxmox task to complete.
// POST /api/v1/inventory/items/:id/vm/snapshots
func (h *VMHandler) CreateSnapshot(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req createSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.SnapshotVM, true)
	if !ok {
		return
	}

	if err := h.PX.CreateSnapshot(c.Request.Context(), target.Node, target.VMID, req.Snapname, req.Description, req.VMState); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to create snapshot", "create vm snapshot", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type powerActionRequest struct {
	Action string `json:"action" binding:"required,oneof=start shutdown reboot stop"`
}

// PowerAction performs a power action (start, shutdown, reboot, stop) on a VM
// and waits for the Proxmox task to complete.
// POST /api/v1/inventory/items/:id/vm/power
func (h *VMHandler) PowerAction(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req powerActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.PowerVM, true)
	if !ok {
		return
	}

	ctx := c.Request.Context()
	var err error

	switch req.Action {
	case "start":
		err = h.PX.StartVM(ctx, target.Node, target.VMID)
	case "shutdown":
		err = h.PX.ShutdownVM(ctx, target.Node, target.VMID)
	case "reboot":
		err = h.PX.RebootVM(ctx, target.Node, target.VMID)
	case "stop":
		err = h.PX.StopVM(ctx, target.Node, target.VMID)
	}

	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to perform VM power action", "vm power action", err)
		return
	}

	switch req.Action {
	case "start", "reboot":
		h.waitForObservedVMStatus(target.VMID, "running")
	case "shutdown", "stop":
		h.waitForObservedVMStatus(target.VMID, "stopped")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteVM deletes a VM from Proxmox (waits for the task to complete) and
// removes it from the inventory.
// DELETE /api/v1/inventory/items/:id/vm
func (h *VMHandler) DeleteVM(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.DeleteVM, true)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	if err := h.PX.DeleteVM(ctx, target.Node, target.VMID); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to delete VM", "delete proxmox vm", err)
		return
	}

	if err := h.Service.DeleteInventoryVM(ctx, target.ItemID); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "VM deleted from Proxmox but failed to remove from inventory", "delete inventory item for vm", err)
		return
	}

	h.waitForVMRemoval(target.VMID)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type renameVMRequest struct {
	Name string `json:"name" binding:"required"`
}

const maxVMNotesLength = 255

type updateVMNotesRequest struct {
	Notes string `json:"notes"`
}

type updateVMHardwareNetworkRequest struct {
	Device     string `json:"device"`
	Bridge     string `json:"bridge"`
	Model      string `json:"model"`
	VLANTag    int    `json:"vlan_tag"`
	Firewall   bool   `json:"firewall"`
	MACAddress string `json:"mac_address"`
}

type updateVMHardwareRequest struct {
	OSType   string                           `json:"ostype"`
	BIOS     string                           `json:"bios"`
	Machine  string                           `json:"machine"`
	SCSI     string                           `json:"scsi"`
	Sockets  int                              `json:"sockets"`
	Cores    int                              `json:"cores"`
	CPUType  string                           `json:"cpu_type"`
	Memory   int                              `json:"memory"`
	Balloon  int                              `json:"balloon"`
	Storage  string                           `json:"storage"`
	DiskSize int                              `json:"disk_size"`
	Networks []updateVMHardwareNetworkRequest `json:"networks"`
}

// RenameVM renames a VM in Proxmox and updates the inventory.
// POST /api/v1/inventory/items/:id/vm/rename
func (h *VMHandler) RenameVM(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req renameVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	req.Name = names.Normalize(req.Name)
	if err := names.ValidateVM(req.Name); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.RenameVM, true)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	if err := h.PX.RenameVM(ctx, target.Node, target.VMID, req.Name); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to rename VM", "rename vm", err)
		return
	}

	if err := h.Service.UpdateInventoryVMName(ctx, target.ItemID, req.Name); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "vm renamed in Proxmox but failed to refresh inventory metadata", "update inventory name for vm", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UpdateNotes stores VM notes in Postgres and replicates them to Proxmox.
// PUT /api/v1/inventory/items/:id/vm/notes
func (h *VMHandler) UpdateNotes(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}

	var req updateVMNotesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	notes := strings.TrimSpace(req.Notes)
	if len(notes) > maxVMNotesLength {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error": fmt.Sprintf("notes must be %d characters or less", maxVMNotesLength),
		})
		return
	}

	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.RenameVM, true)
	if !ok {
		return
	}

	if err := h.Service.UpdateInventoryVMNotes(c.Request.Context(), target.ItemID, notes); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to update VM notes", "update vm notes in inventory", err)
		return
	}

	if h.PX == nil {
		c.JSON(http.StatusAccepted, gin.H{"ok": true, "synced": false})
		return
	}

	if err := h.PX.UpdateVMNotes(c.Request.Context(), target.Node, target.VMID, notes); err != nil {
		log.Printf("vm notes saved to postgres but proxmox sync is pending for %s/%d: %v", target.Node, target.VMID, err)
		c.JSON(http.StatusAccepted, gin.H{"ok": true, "synced": false})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "synced": true})
}

// GetHardware returns the current editable hardware configuration for a VM.
// GET /api/v1/inventory/items/:id/vm/hardware
func (h *VMHandler) GetHardware(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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

	config, err := h.PX.GetVMHardwareConfig(c.Request.Context(), target.Node, target.VMID)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch VM hardware", "fetch vm hardware config", err)
		return
	}

	c.JSON(http.StatusOK, config)
}

// UpdateHardware updates editable hardware settings for a VM and refreshes summary metadata.
// PUT /api/v1/inventory/items/:id/vm/hardware
func (h *VMHandler) UpdateHardware(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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

	var req updateVMHardwareRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	if err := validateVMHardwareRequest(req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
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

	if err := h.PX.UpdateVMHardware(c.Request.Context(), target.Node, target.VMID, config); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
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
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
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

type cloneVMRequest struct {
	NewID          int    `json:"newid"`
	Name           string `json:"name" binding:"required"`
	Full           bool   `json:"full"`
	Target         string `json:"target"`
	TargetFolderID string `json:"target_folder_id" binding:"required"`
}

type vmMutationResponse struct {
	OK     bool          `json:"ok"`
	VMID   int           `json:"vmid"`
	ItemID uuid.UUID     `json:"item_id"`
	Item   InventoryItem `json:"item"`
}

// CloneVM clones a VM and waits for the Proxmox task to complete.
// POST /api/v1/inventory/items/:id/vm/clone
func (h *VMHandler) CloneVM(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req cloneVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	req.Name = names.Normalize(req.Name)
	if err := names.ValidateVM(req.Name); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	source, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.CloneVM, true)
	if !ok {
		return
	}

	targetFolderID, err := uuid.Parse(req.TargetFolderID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target_folder_id"})
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, targetFolderID, authorization.CreateVM) {
		return
	}

	placement, err := h.Service.ResolveFolderPlacement(c.Request.Context(), targetFolderID)
	if err != nil {
		writeInventoryError(c, err)
		return
	}

	targetNode := strings.TrimSpace(req.Target)
	if targetNode == "" {
		optimalNode, err := h.PX.GetOptimalNode(c.Request.Context())
		if err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to resolve optimal node", "resolve optimal node", err)
			return
		}
		targetNode = optimalNode.Node
	}

	newID := req.NewID
	if newID <= 0 {
		nextID, err := h.PX.GetNextVMID(c.Request.Context())
		if err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to fetch next VMID", "fetch next vmid", err)
			return
		}
		newID = nextID
	}

	available, err := h.PX.IsVMIDAvailable(c.Request.Context(), newID)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to validate VMID", "validate vmid", err)
		return
	}
	if !available {
		c.JSON(http.StatusConflict, gin.H{"error": "VM ID is already in use"})
		return
	}

	if err := h.PX.CloneVM(c.Request.Context(), source.Node, source.VMID, newID, req.Name, req.Full, targetNode); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to clone VM", "clone proxmox vm", err)
		return
	}

	if err := h.PX.SetVMUpstreamUUID(c.Request.Context(), targetNode, newID, uuid.New()); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to assign clone identity", "assign cloned vm upstream uuid", err)
		return
	}

	if err := h.PX.SyncVMPoolMembership(c.Request.Context(), targetNode, newID, placement.PoolID, placement.Path); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to sync VM pool membership", "sync cloned vm pool membership", err)
		return
	}

	clonedItemID, err := h.Importer.SyncVM(
		c.Request.Context(),
		placement.FolderID,
		targetNode,
		newID,
	)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "vm cloned in Proxmox but failed to sync inventory metadata", "sync cloned vm inventory metadata", err)
		return
	}

	h.Service.NotifyInventoryChanged(c.Request.Context(), clonedItemID)

	item, err := h.Service.GetInventoryItemWithPermissions(
		c.Request.Context(),
		principalID,
		clonedItemID,
	)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "vm cloned in Proxmox but failed to load inventory item", "load cloned vm inventory item", err)
		return
	}

	c.JSON(http.StatusOK, vmMutationResponse{
		OK:     true,
		VMID:   newID,
		ItemID: clonedItemID,
		Item:   buildInventoryItem(item),
	})
}

// ConvertToTemplate converts a VM to a template.
// POST /api/v1/inventory/items/:id/vm/template
func (h *VMHandler) ConvertToTemplate(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.TemplateVM, true)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	if err := h.PX.ConvertToTemplate(ctx, target.Node, target.VMID); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to convert to template", "convert vm to template", err)
		return
	}

	if err := h.Service.UpdateInventoryVMIsTemplate(ctx, target.ItemID); err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "vm converted to template in Proxmox but failed to refresh inventory metadata", "update vm template state in inventory", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetSnapshots returns all snapshots for a VM.
// GET /api/v1/inventory/items/:id/vm/snapshots
func (h *VMHandler) GetSnapshots(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.SnapshotVM, false)
	if !ok {
		return
	}

	snapshots, err := h.PX.GetSnapshots(c.Request.Context(), target.Node, target.VMID)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch snapshots", "fetch vm snapshots", err)
		return
	}

	sort.Slice(snapshots, func(i, j int) bool {
		return snapshots[i].Snaptime < snapshots[j].Snaptime
	})

	c.JSON(http.StatusOK, snapshots)
}

type rollbackSnapshotRequest struct {
	Snapname string `json:"snapname" binding:"required"`
}

// RollbackSnapshot rolls back a VM to a snapshot and waits for the Proxmox task to complete.
// POST /api/v1/inventory/items/:id/vm/snapshots/rollback
func (h *VMHandler) RollbackSnapshot(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req rollbackSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.SnapshotVM, true)
	if !ok {
		return
	}

	if err := h.PX.RollbackSnapshot(c.Request.Context(), target.Node, target.VMID, req.Snapname); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to rollback snapshot", "rollback vm snapshot", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteSnapshot deletes a VM snapshot and waits for the Proxmox task to complete.
// DELETE /api/v1/inventory/items/:id/vm/snapshots/:snapname
func (h *VMHandler) DeleteSnapshot(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	snapname := c.Param("snapname")
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.SnapshotVM, true)
	if !ok {
		return
	}

	if err := h.PX.DeleteSnapshot(c.Request.Context(), target.Node, target.VMID, snapname); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to delete snapshot", "delete vm snapshot", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
