package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
)

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
