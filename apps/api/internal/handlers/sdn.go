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

// DeleteVNet deletes an SDN virtual network and applies the config.
// DELETE /api/v1/sdn/vnets/:vnet
func (h *SDNHandler) DeleteVNet(c *gin.Context) {
	vnet := c.Param("vnet")
	ctx := c.Request.Context()

	if err := h.PX.DeleteVNet(ctx, vnet); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to delete VNet"})
		return
	}

	if err := h.PX.ApplySDN(ctx); err != nil {
		log.Printf("SDN apply after delete VNet failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func intToStr(n int) string {
	return fmt.Sprintf("%d", n)
}
