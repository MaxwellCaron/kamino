package handlers

import (
	"fmt"
	"log"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

// SDNHandler handles SDN-related API endpoints.
type SDNHandler struct {
	PX    *proxmox.Client
	Authz *authorization.Service
}

func (h *SDNHandler) requireSDNPermission(
	c *gin.Context,
	required authorization.ManagementPermission,
) bool {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return false
	}

	return requireManagementPermission(c, h.Authz, principalID, required)
}

type bulkDeleteVNetsRequest struct {
	VNets []string `json:"vnets" binding:"required,min=1"`
}

type bulkDeleteVNetFailure struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

type bulkDeleteVNetsResponse struct {
	Deleted []string                `json:"deleted"`
	Failed  []bulkDeleteVNetFailure `json:"failed"`
}

// GetVNets returns all SDN virtual networks.
// GET /api/v1/sdn/vnets
func (h *SDNHandler) GetVNets(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionInfrastructureView) {
		return
	}

	vnets, err := h.PX.GetVNets(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch VNets", "fetch vnets", err)
		return
	}
	c.JSON(http.StatusOK, vnets)
}

type createVNetRequest struct {
	VNet  string `json:"vnet" binding:"required"`
	Zone  string `json:"zone" binding:"required"`
	Tag   int    `json:"tag"`
	Alias string `json:"alias"`
}

// CreateVNet creates a new SDN virtual network and applies the config.
// POST /api/v1/sdn/vnets
func (h *SDNHandler) CreateVNet(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionInfrastructureManage) {
		return
	}

	var req createVNetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	ctx := c.Request.Context()
	params := map[string]string{
		"vnet": req.VNet,
		"zone": req.Zone,
	}
	if req.Tag > 0 {
		params["tag"] = intToStr(req.Tag)
	}
	if req.Alias != "" {
		params["alias"] = req.Alias
	}

	if err := h.PX.CreateVNet(ctx, params); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to create VNet", "create vnet", err)
		return
	}

	if err := h.PX.ApplySDN(ctx); err != nil {
		log.Printf("SDN apply after create VNet failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type updateVNetRequest struct {
	Zone  string `json:"zone"`
	Tag   int    `json:"tag"`
	Alias string `json:"alias"`
}

// UpdateVNet updates an existing SDN virtual network and applies the config.
// PUT /api/v1/sdn/vnets/:vnet
func (h *SDNHandler) UpdateVNet(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionInfrastructureManage) {
		return
	}

	vnet := c.Param("vnet")
	var req updateVNetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	ctx := c.Request.Context()
	params := make(map[string]string)
	if req.Zone != "" {
		params["zone"] = req.Zone
	}
	if req.Tag > 0 {
		params["tag"] = intToStr(req.Tag)
	}
	if req.Alias != "" {
		params["alias"] = req.Alias
	}

	if err := h.PX.UpdateVNet(ctx, vnet, params); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to update VNet", "update vnet", err)
		return
	}

	if err := h.PX.ApplySDN(ctx); err != nil {
		log.Printf("SDN apply after update VNet failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteVNets deletes multiple SDN virtual networks and applies the config once.
// DELETE /api/v1/sdn/vnets
func (h *SDNHandler) DeleteVNets(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionInfrastructureManage) {
		return
	}

	var req bulkDeleteVNetsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	ctx := c.Request.Context()
	response := bulkDeleteVNetsResponse{
		Deleted: make([]string, 0, len(req.VNets)),
		Failed:  make([]bulkDeleteVNetFailure, 0),
	}

	for _, vnet := range req.VNets {
		if err := h.PX.DeleteVNet(ctx, vnet); err != nil {
			logRequestError(c, "delete vnet "+vnet, err)
			response.Failed = append(response.Failed, bulkDeleteVNetFailure{
				ID:    vnet,
				Error: "delete failed",
			})
			continue
		}

		response.Deleted = append(response.Deleted, vnet)
	}

	if len(response.Deleted) > 0 {
		if err := h.PX.ApplySDN(ctx); err != nil {
			log.Printf("SDN apply after bulk delete VNet failed: %v", err)
		}
	}

	c.JSON(http.StatusOK, response)
}

func intToStr(n int) string {
	return fmt.Sprintf("%d", n)
}
