package handlers

import (
	"context"
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
		writeUnauthorized(c)
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

type bulkCreateVNetsRequest struct {
	VNets []createVNetRequest `json:"vnets" binding:"required,min=1"`
}

type bulkCreateVNetFailure struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

type bulkCreateVNetsResponse struct {
	Created []string                `json:"created"`
	Failed  []bulkCreateVNetFailure `json:"failed"`
}

const maxBulkCreateVNets = 50

func shouldApplySDN(c *gin.Context) bool {
	switch strings.ToLower(strings.TrimSpace(c.DefaultQuery("apply", "true"))) {
	case "false", "0", "no":
		return false
	default:
		return true
	}
}

func validateAndBuildCreateVNetParams(req createVNetRequest) (string, map[string]string, error) {
	vnetID := strings.TrimSpace(req.VNet)
	zone := strings.TrimSpace(req.Zone)
	alias := strings.TrimSpace(req.Alias)

	if err := validateVNetID(vnetID); err != nil {
		return "", nil, err
	}
	if zone == "" {
		return "", nil, fmt.Errorf("zone is required")
	}
	if req.Tag > 0 {
		if err := validateVNetTag(req.Tag); err != nil {
			return "", nil, err
		}
	}

	params := map[string]string{
		"type": "vnet",
		"vnet": vnetID,
		"zone": zone,
	}
	if req.Tag > 0 {
		params["tag"] = intToStr(req.Tag)
	}
	if alias != "" {
		params["alias"] = alias
	}
	if req.VLANAware {
		params["vlanaware"] = "1"
	}
	if req.IsolatePorts {
		params["isolate-ports"] = "1"
	}
	return vnetID, params, nil
}

type validatedCreateVNet struct {
	id     string
	zone   string
	params map[string]string
}

type sdnVNetCreator interface {
	CreateVNet(context.Context, map[string]string) error
	ApplySDN(context.Context) error
}

func executeBulkCreateVNets(
	ctx context.Context,
	px sdnVNetCreator,
	items []validatedCreateVNet,
	apply bool,
) bulkCreateVNetsResponse {
	response := bulkCreateVNetsResponse{
		Created: make([]string, 0, len(items)),
		Failed:  make([]bulkCreateVNetFailure, 0),
	}

	for _, item := range items {
		if err := px.CreateVNet(ctx, item.params); err != nil {
			response.Failed = append(response.Failed, bulkCreateVNetFailure{
				ID:    item.id,
				Error: "create failed",
			})
			continue
		}
		response.Created = append(response.Created, item.id)
	}

	if apply && len(response.Created) > 0 {
		if err := px.ApplySDN(ctx); err != nil {
			log.Printf("SDN apply after bulk create VNet failed: %v", err)
		}
	}

	return response
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

	vnetID, params, err := validateAndBuildCreateVNetParams(req)
	if err != nil {
		writeInvalidRequest(c, err.Error())
		return
	}

	ctx := c.Request.Context()

	if err := h.PX.CreateVNet(ctx, params); err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to create VNet", "create vnet", err)
		return
	}

	if shouldApplySDN(c) {
		if err := h.PX.ApplySDN(ctx); err != nil {
			log.Printf("SDN apply after create VNet failed: %v", err)
		}
	}

	h.Audit.RecordSuccess(ctx, audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "sdn.vnet.create",
		TargetKind:       "sdn_vnet",
		Metadata:         map[string]any{"vnet": vnetID, "zone": params["zone"]},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// CreateVNets creates multiple SDN virtual networks and applies the config once.
// POST /api/v1/sdn/vnets/bulk
func (h *SDNHandler) CreateVNets(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	var req bulkCreateVNetsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	if len(req.VNets) > maxBulkCreateVNets {
		writeInvalidRequest(c, fmt.Sprintf("cannot create more than %d VNets at once", maxBulkCreateVNets))
		return
	}

	validated := make([]validatedCreateVNet, 0, len(req.VNets))
	seen := make(map[string]struct{}, len(req.VNets))
	for _, item := range req.VNets {
		vnetID, params, err := validateAndBuildCreateVNetParams(item)
		if err != nil {
			writeInvalidRequest(c, err.Error())
			return
		}
		if _, ok := seen[vnetID]; ok {
			writeInvalidRequest(c, "duplicate VNet ID in request")
			return
		}
		seen[vnetID] = struct{}{}
		validated = append(validated, validatedCreateVNet{
			id:     vnetID,
			zone:   params["zone"],
			params: params,
		})
	}

	ctx := c.Request.Context()
	response := executeBulkCreateVNets(ctx, h.PX, validated, shouldApplySDN(c))

	for _, vnetID := range response.Created {
		zone := ""
		for _, item := range validated {
			if item.id == vnetID {
				zone = item.zone
				break
			}
		}
		h.Audit.RecordSuccess(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "sdn.vnet.create",
			TargetKind:       "sdn_vnet",
			Metadata:         map[string]any{"vnet": vnetID, "zone": zone},
		})
	}
	for _, failure := range response.Failed {
		logRequestError(c, "create vnet "+failure.ID, fmt.Errorf("%s", failure.Error))
		h.Audit.RecordFailure(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "sdn.vnet.create",
			TargetKind:       "sdn_vnet",
			Metadata:         map[string]any{"vnet": failure.ID},
		}, failure.Error)
	}

	c.JSON(http.StatusOK, response)
}

// ApplySDN applies the current SDN configuration.
// POST /api/v1/sdn/apply
func (h *SDNHandler) ApplySDN(c *gin.Context) {
	if !h.requireSDNPermission(c, authorization.ManagementPermissionAdministrator) {
		return
	}
	principalID, _ := currentPrincipalID(c)

	ctx := c.Request.Context()
	if err := h.PX.ApplySDN(ctx); err != nil {
		h.Audit.RecordFailure(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "sdn.apply",
			TargetKind:       "sdn",
		}, "apply failed")
		writeLoggedError(c, http.StatusBadGateway, "failed to apply SDN configuration", "apply sdn", err)
		return
	}

	h.Audit.RecordSuccess(ctx, audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "sdn.apply",
		TargetKind:       "sdn",
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

	if shouldApplySDN(c) && len(response.Deleted) > 0 {
		if err := h.PX.ApplySDN(ctx); err != nil {
			log.Printf("SDN apply after bulk delete VNet failed: %v", err)
		}
	}

	c.JSON(http.StatusOK, response)
}

func intToStr(n int) string {
	return fmt.Sprintf("%d", n)
}
