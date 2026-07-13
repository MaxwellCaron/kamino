package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
)

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
