package handlers

import (
	"fmt"
	"log"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

// SDNHandler handles SDN-related API endpoints.
type SDNHandler struct {
	PX *proxmox.Client
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
	vnets, err := h.PX.GetVNets(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch VNets"})
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
	var req createVNetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to create VNet"})
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
	vnet := c.Param("vnet")
	var req updateVNetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to update VNet"})
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
	var req bulkDeleteVNetsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	response := bulkDeleteVNetsResponse{
		Deleted: make([]string, 0, len(req.VNets)),
		Failed:  make([]bulkDeleteVNetFailure, 0),
	}

	for _, vnet := range req.VNets {
		if err := h.PX.DeleteVNet(ctx, vnet); err != nil {
			response.Failed = append(response.Failed, bulkDeleteVNetFailure{
				ID:    vnet,
				Error: err.Error(),
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
