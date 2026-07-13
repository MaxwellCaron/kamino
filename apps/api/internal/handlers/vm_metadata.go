package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/gin-gonic/gin"
)

type renameVMRequest struct {
	Name string `json:"name" binding:"required"`
}

const maxVMNotesLength = 256

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
		writeUnauthorized(c)
		return
	}

	var req renameVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	req.Name = names.Normalize(req.Name)
	if err := names.ValidateVM(req.Name); err != nil {
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate vm name", err)
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

	h.runClaimedVMAction(c, target.ItemID, "rename_vm", principalID, func() bool {
		ctx := c.Request.Context()

		if err := h.PX.RenameVM(ctx, target.GuestType, target.Node, target.VMID, req.Name); err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to rename VM", "rename vm", err)
			return false
		}

		if err := h.Service.UpdateInventoryVMName(ctx, target.ItemID, req.Name); err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "vm renamed in Proxmox but failed to refresh inventory metadata", "update inventory name for vm", err)
			return false
		}

		h.Audit.RecordSuccess(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.rename",
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
			Metadata:         map[string]any{"name": req.Name},
		})
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return true
	})
}

// UpdateNotes stores VM notes in Postgres and replicates them to Proxmox.
// PUT /api/v1/inventory/items/:id/vm/notes
func (h *VMHandler) UpdateNotes(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
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

	h.runClaimedVMAction(c, target.ItemID, "update_notes", principalID, func() bool {
		if err := h.Service.UpdateInventoryVMNotes(c.Request.Context(), target.ItemID, notes); err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to update VM notes", "update vm notes in inventory", err)
			return false
		}

		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.notes.update",
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
		})
		if h.PX == nil {
			c.JSON(http.StatusAccepted, gin.H{"ok": true, "synced": false})
			return true
		}

		if err := h.PX.UpdateVMNotes(c.Request.Context(), target.GuestType, target.Node, target.VMID, notes); err != nil {
			log.Printf("vm notes saved to postgres but proxmox sync is pending for %s/%d: %v", target.Node, target.VMID, err)
			c.JSON(http.StatusAccepted, gin.H{"ok": true, "synced": false})
			return true
		}

		c.JSON(http.StatusOK, gin.H{"ok": true, "synced": true})
		return true
	})
}
