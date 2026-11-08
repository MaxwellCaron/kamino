package sdn

import (
	"net/http"
	"sort"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

type SDNHandler struct {
	PX    *proxmox.Client
	Authz *authorization.Service
	Audit *audit.Service
}

// vnetResponse is the app-facing shape of a Proxmox VNet, using
// `isolate_ports` instead of Proxmox's `isolate-ports` wire key.
type vnetResponse struct {
	Type         string `json:"type,omitempty"`
	VNet         string `json:"vnet"`
	Zone         string `json:"zone"`
	Tag          int    `json:"tag,omitempty"`
	Alias        string `json:"alias,omitempty"`
	VLANAware    bool   `json:"vlanaware,omitempty"`
	IsolatePorts bool   `json:"isolate_ports,omitempty"`
}

func toVNetResponse(v proxmox.VNet) vnetResponse {
	return vnetResponse{
		Type:         v.Type,
		VNet:         v.VNet,
		Zone:         v.Zone,
		Tag:          v.Tag,
		Alias:        v.Alias,
		VLANAware:    bool(v.VLANAware),
		IsolatePorts: bool(v.IsolatePorts),
	}
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

func (h *SDNHandler) requireSDNPermission(
	c *gin.Context,
	required authorization.ManagementPermission,
) bool {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return false
	}

	return httpx.RequireManagementPermission(c, h.Authz, principalID, required)
}

// GetVNets returns all SDN virtual networks.
// GET /api/v1/sdn/vnets
func (h *SDNHandler) GetVNets(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	vnets, err := h.PX.GetVNets(c.Request.Context())
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusBadGateway, "failed to fetch VNets", "fetch vnets", err)
		return
	}

	responses := make([]vnetResponse, 0, len(vnets))
	for _, v := range vnets {
		responses = append(responses, toVNetResponse(v))
	}
	c.JSON(http.StatusOK, responses)
}

// GetSDNZones returns all configured SDN zones, sorted alphabetically.
// GET /api/v1/sdn/zones
func (h *SDNHandler) GetSDNZones(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	zones, err := h.PX.GetSDNZones(c.Request.Context())
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusBadGateway, "failed to fetch SDN zones", "fetch sdn zones", err)
		return
	}

	sort.Slice(zones, func(i, j int) bool { return zones[i].Zone < zones[j].Zone })
	c.JSON(http.StatusOK, zones)
}
