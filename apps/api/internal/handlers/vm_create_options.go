package handlers

import (
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *VMCreateHandler) GetStorages(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireVMCreateMetadataAccess(c, h.Authz, principalID) {
		return
	}

	node := c.Param("node")
	storages, err := h.PX.GetStorages(c.Request.Context(), node)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch storages", "fetch node storages", err)
		return
	}
	response := make([]proxmox.StorageWithClassification, len(storages))
	for index, storage := range storages {
		response[index] = proxmox.StorageWithClassification{
			Storage:        storage,
			KaminoShared:   h.PX.IsSharedStorage(storage),
			KaminoExcluded: h.PX.IsExcludedStorage(storage),
		}
	}
	c.JSON(http.StatusOK, response)
}

// GetISOs returns ISO files available on a storage.
// GET /api/v1/proxmox/nodes/:node/storages/:storage/isos
func (h *VMCreateHandler) GetISOs(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireVMCreateMetadataAccess(c, h.Authz, principalID) {
		return
	}

	node := c.Param("node")
	storage := c.Param("storage")
	isos, err := h.PX.GetISOs(c.Request.Context(), node, storage)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch ISOs", "fetch node isos", err)
		return
	}
	c.JSON(http.StatusOK, isos)
}

// GetCreateISOs returns ISO files for a storage from the configured metadata node.
// GET /api/v1/proxmox/create/isos/:storage
func (h *VMCreateHandler) GetCreateISOs(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireVMCreateMetadataAccess(c, h.Authz, principalID) {
		return
	}

	storage := c.Param("storage")

	createOptionsNode, err := h.PX.ResolvePrimaryNode(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to resolve primary node", "resolve primary node", err)
		return
	}

	isos, err := h.PX.GetCreateISOs(
		c.Request.Context(),
		createOptionsNode.Node,
		storage,
	)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch ISOs", "fetch create option isos", err)
		return
	}
	c.JSON(http.StatusOK, isos)
}

// GetNextVMID returns the next available VMID.
// GET /api/v1/proxmox/nextid
func (h *VMCreateHandler) GetNextVMID(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireVMCreateMetadataAccess(c, h.Authz, principalID) {
		return
	}

	id, err := h.PX.GetNextVMID(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch next VMID", "fetch next vmid", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"vmid": id})
}

// ValidateVMID reports whether a VMID is available.
// GET /api/v1/proxmox/vmid/:vmid/validate
func (h *VMCreateHandler) ValidateVMID(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireVMCreateMetadataAccess(c, h.Authz, principalID) {
		return
	}

	vmid, err := parseIntParam(c, "vmid")
	if err != nil {
		return
	}

	available, err := h.PX.IsVMIDAvailable(c.Request.Context(), vmid)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to validate VMID", "validate vmid", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"valid": available})
}

// GetBridges returns network bridges for a node.
// GET /api/v1/proxmox/nodes/:node/bridges
func (h *VMCreateHandler) GetBridges(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireVMCreateMetadataAccess(c, h.Authz, principalID) {
		return
	}

	scopeItemIDValue := strings.TrimSpace(c.Query("scope_item_id"))
	scopeItemID := uuid.Nil
	if scopeItemIDValue != "" {
		parsedItemID, err := uuid.Parse(scopeItemIDValue)
		if err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "invalid scope_item_id"})
			return
		}
		scopeItemID = parsedItemID
	}

	node := c.Param("node")
	bridges, err := h.PX.GetBridges(c.Request.Context(), node)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch bridges", "fetch node bridges", err)
		return
	}
	vnets, err := h.PX.GetVNets(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch VNets", "fetch vnets", err)
		return
	}

	if scopeItemID != uuid.Nil {
		isManager, err := h.Authz.IsManager(c.Request.Context(), principalID)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to determine management permissions", "check vm bridge options management permission", err)
			return
		}
		if !isManager {
			scopedVNetName, scoped, err := personalPodNetworkScope(
				c.Request.Context(),
				h.DB,
				h.PersonalPodVNetPrefix,
				h.PersonalPodVLANBase,
				scopeItemID,
			)
			if err != nil {
				writeLoggedError(c, http.StatusInternalServerError, "failed to determine personal pod network scope", "resolve vm bridge options network scope", err)
				return
			}
			if scoped {
				c.JSON(http.StatusOK, gin.H{
					"bridges": []proxmox.NetworkBridge{},
					"vnets":   filterVNetsByName(vnets, scopedVNetName),
				})
				return
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"bridges": bridges, "vnets": vnets})
}
