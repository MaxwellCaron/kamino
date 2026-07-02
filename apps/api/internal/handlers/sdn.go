package handlers

import (
	"fmt"
	"log"
	"net/http"
	"regexp"
	"sort"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
)

var vnetIDPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]*$`)

func validateVNetID(id string) error {
	if len(id) < 2 || len(id) > 8 {
		return fmt.Errorf("VNet ID must be 2-8 characters")
	}
	if !vnetIDPattern.MatchString(id) {
		return fmt.Errorf("VNet ID must start with a letter and contain only letters and numbers")
	}
	return nil
}

func validateVNetTag(tag int) error {
	if tag < 1 || tag > 16777215 {
		return fmt.Errorf("tag must be between 1 and 16777215")
	}
	return nil
}

// SDNHandler handles SDN-related API endpoints.
type SDNHandler struct {
	PX    *proxmox.Client
	Authz *authorization.Service
	Audit *audit.Service
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

// GetVNets returns all SDN virtual networks.
// GET /api/v1/sdn/vnets
func (h *SDNHandler) GetVNets(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}

	vnets, err := h.PX.GetVNets(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch VNets", "fetch vnets", err)
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
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch SDN zones", "fetch sdn zones", err)
		return
	}

	sort.Slice(zones, func(i, j int) bool { return zones[i].Zone < zones[j].Zone })
	c.JSON(http.StatusOK, zones)
}

type createVNetRequest struct {
	VNet         string `json:"vnet" binding:"required"`
	Zone         string `json:"zone" binding:"required"`
	Tag          int    `json:"tag"`
	Alias        string `json:"alias"`
	VLANAware    bool   `json:"vlanaware"`
	IsolatePorts bool   `json:"isolate_ports"`
}

// CreateVNet creates a new SDN virtual network and applies the config.
// POST /api/v1/sdn/vnets
func (h *SDNHandler) CreateVNet(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	var req createVNetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	vnetID := strings.TrimSpace(req.VNet)
	if err := validateVNetID(vnetID); err != nil {
		writeInvalidRequest(c, err.Error())
		return
	}
	if req.Tag > 0 {
		if err := validateVNetTag(req.Tag); err != nil {
			writeInvalidRequest(c, err.Error())
			return
		}
	}

	ctx := c.Request.Context()
	params := map[string]string{
		"type": "vnet",
		"vnet": vnetID,
		"zone": req.Zone,
	}
	if req.Tag > 0 {
		params["tag"] = intToStr(req.Tag)
	}
	if req.Alias != "" {
		params["alias"] = req.Alias
	}
	if req.VLANAware {
		params["vlanaware"] = "1"
	}
	if req.IsolatePorts {
		params["isolate-ports"] = "1"
	}

	if err := h.PX.CreateVNet(ctx, params); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to create VNet", "create vnet", err)
		return
	}

	if err := h.PX.ApplySDN(ctx); err != nil {
		log.Printf("SDN apply after create VNet failed: %v", err)
	}

	h.Audit.RecordSuccess(ctx, audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "sdn.vnet.create",
		TargetKind:       "sdn_vnet",
		Metadata:         map[string]any{"vnet": vnetID, "zone": req.Zone},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type updateVNetRequest struct {
	Zone         string `json:"zone"`
	Tag          int    `json:"tag"`
	Alias        string `json:"alias"`
	VLANAware    *bool  `json:"vlanaware"`
	IsolatePorts *bool  `json:"isolate_ports"`
}

// UpdateVNet updates an existing SDN virtual network and applies the config.
// PUT /api/v1/sdn/vnets/:vnet
func (h *SDNHandler) UpdateVNet(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	vnet := c.Param("vnet")
	if err := validateVNetID(vnet); err != nil {
		writeInvalidRequest(c, err.Error())
		return
	}

	var req updateVNetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	if req.Tag > 0 {
		if err := validateVNetTag(req.Tag); err != nil {
			writeInvalidRequest(c, err.Error())
			return
		}
	}

	ctx := c.Request.Context()
	params := make(map[string]string)
	deleteFields := make([]string, 0, 4)

	if req.Zone != "" {
		params["zone"] = req.Zone
	}

	if req.Tag > 0 {
		params["tag"] = intToStr(req.Tag)
	} else {
		deleteFields = append(deleteFields, "tag")
	}

	if req.Alias != "" {
		params["alias"] = req.Alias
	} else {
		deleteFields = append(deleteFields, "alias")
	}

	if req.VLANAware != nil {
		if *req.VLANAware {
			params["vlanaware"] = "1"
		} else {
			deleteFields = append(deleteFields, "vlanaware")
		}
	}

	if req.IsolatePorts != nil {
		if *req.IsolatePorts {
			params["isolate-ports"] = "1"
		} else {
			deleteFields = append(deleteFields, "isolate-ports")
		}
	}

	if len(deleteFields) > 0 {
		params["delete"] = strings.Join(deleteFields, ",")
	}

	if err := h.PX.UpdateVNet(ctx, vnet, params); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to update VNet", "update vnet", err)
		return
	}

	if err := h.PX.ApplySDN(ctx); err != nil {
		log.Printf("SDN apply after update VNet failed: %v", err)
	}

	h.Audit.RecordSuccess(ctx, audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "sdn.vnet.update",
		TargetKind:       "sdn_vnet",
		Metadata:         map[string]any{"vnet": vnet},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteVNets deletes multiple SDN virtual networks and applies the config once.
// DELETE /api/v1/sdn/vnets
func (h *SDNHandler) DeleteVNets(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

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
		if err := validateVNetID(vnet); err != nil {
			writeInvalidRequest(c, err.Error())
			return
		}
		if err := h.PX.DeleteVNet(ctx, vnet); err != nil {
			logRequestError(c, "delete vnet "+vnet, err)
			response.Failed = append(response.Failed, bulkDeleteVNetFailure{
				ID:    vnet,
				Error: "delete failed",
			})
			h.Audit.RecordFailure(ctx, audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "sdn.vnet.delete",
				TargetKind:       "sdn_vnet",
				Metadata:         map[string]any{"vnet": vnet},
			}, "delete failed")
			continue
		}

		response.Deleted = append(response.Deleted, vnet)
		h.Audit.RecordSuccess(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "sdn.vnet.delete",
			TargetKind:       "sdn_vnet",
			Metadata:         map[string]any{"vnet": vnet},
		})
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
