package pods

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/handlers/inventoryview"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type podRouterCloneRequest struct {
	TargetFolderID    string `json:"target_folder_id" binding:"required"`
	NetworkNumber     int32  `json:"network_number" binding:"required"`
	NetworkProfileKey string `json:"network_profile_key" binding:"required"`
	CloneTargetKey    string `json:"clone_target_key"`
	VMID              int    `json:"vmid"`
}

type podRouterCloneOptionsResponse struct {
	RouterTemplateConfigured bool                       `json:"router_template_configured"`
	NetworkProfiles          []podnetwork.PublicProfile `json:"network_profiles"`
	CloneTargets             []podCloneTargetResponse   `json:"clone_targets"`
}

type podRouterCloneResponse struct {
	VMID              int                         `json:"vmid"`
	ItemID            uuid.UUID                   `json:"item_id"`
	Item              inventoryview.InventoryItem `json:"item"`
	TargetFolderID    uuid.UUID                   `json:"target_folder_id"`
	NetworkNumber     int32                       `json:"network_number"`
	NetworkProfileKey string                      `json:"network_profile_key"`
	CloneTargetKey    string                      `json:"clone_target_key"`
	VNets             []string                    `json:"vnets"`
}

func parsePodRouterCloneRequest(
	catalog *podnetwork.Catalog,
	req podRouterCloneRequest,
) (uuid.UUID, int32, string, int, *httpx.RequestError) {
	targetFolderID, err := uuid.Parse(strings.TrimSpace(req.TargetFolderID))
	if err != nil {
		return uuid.Nil, 0, "", 0, &httpx.RequestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "invalid target folder id",
		}
	}

	if req.NetworkNumber < 1 || req.NetworkNumber > 255 {
		return uuid.Nil, 0, "", 0, &httpx.RequestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "inner VLAN tag must be between 1 and 255",
		}
	}

	profileKey := strings.TrimSpace(req.NetworkProfileKey)
	if _, err := catalog.Profile(profileKey); err != nil {
		return uuid.Nil, 0, "", 0, &httpx.RequestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: fmt.Sprintf("unsupported network profile %q", profileKey),
		}
	}

	if req.VMID != 0 && req.VMID < 100 {
		return uuid.Nil, 0, "", 0, &httpx.RequestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "VM ID must be at least 100",
		}
	}

	return targetFolderID, req.NetworkNumber, profileKey, req.VMID, nil
}

func (h *PodsHandler) GetRouterCloneOptions(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}
	if !httpx.RequireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	profiles := h.publicNetworkProfiles()
	if h.RouterTemplateItemID == uuid.Nil {
		c.JSON(http.StatusOK, podRouterCloneOptionsResponse{
			RouterTemplateConfigured: false,
			NetworkProfiles:          profiles,
			CloneTargets:             []podCloneTargetResponse{},
		})
		return
	}

	if h.NetworkCatalog == nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "pod network catalog is not configured", "load pod router clone options", fmt.Errorf("network catalog is nil"))
		return
	}

	cloneTargets, reqErr := h.listPodCloneTargets(c.Request.Context())
	if reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}

	targetResponses := make([]podCloneTargetResponse, 0, len(cloneTargets))
	for _, cloneTarget := range cloneTargets {
		targetResponses = append(targetResponses, toPodCloneTargetResponse(cloneTarget))
	}

	c.JSON(http.StatusOK, podRouterCloneOptionsResponse{
		RouterTemplateConfigured: true,
		NetworkProfiles:          profiles,
		CloneTargets:             targetResponses,
	})
}

func (h *PodsHandler) CloneRouter(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}
	if !httpx.RequireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	var req podRouterCloneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.WriteInvalidRequest(c, "invalid request body")
		return
	}

	targetFolderID, networkNumber, profileKey, requestedVMID, reqErr := parsePodRouterCloneRequest(h.NetworkCatalog, req)
	if reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}

	cloneTarget, reqErr := h.resolvePodCloneTarget(c.Request.Context(), req.CloneTargetKey)
	if reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}

	if h.RouterTemplateItemID == uuid.Nil {
		httpx.WriteLoggedError(c, http.StatusServiceUnavailable, "pod router template is not configured", "clone pod router", fmt.Errorf("router template item id is nil"))
		return
	}

	if reqErr := requireInventoryPermissionRequest(
		c.Request.Context(),
		h.Authz,
		principalID,
		targetFolderID,
		authorization.CreateVM,
		"authorize pod router clone destination",
	); reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}

	if reqErr := h.ensureProfileVNetsExist(c.Request.Context(), cloneTarget, profileKey); reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}

	reservation, err := h.Service.ReserveFolderVMCapacity(c.Request.Context(), targetFolderID, 1, "pod_router_clone")
	if err != nil {
		inventoryview.WriteInventoryError(c, err)
		return
	}
	if reservation != nil {
		defer reservation.Release(c.Request.Context())
	}

	placement, err := h.Service.ResolveFolderPlacement(c.Request.Context(), targetFolderID)
	if err != nil {
		inventoryview.WriteInventoryError(c, err)
		return
	}

	targetNode, err := h.resolveCloneTargetNode(c.Request.Context())
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusBadGateway, "failed to resolve target node", "resolve pod router clone target node", err)
		return
	}

	var created map[int]clonedVM
	provisioned := false
	recordFailure := func(reqErr *httpx.RequestError) {
		if reqErr == nil || h.Audit == nil {
			return
		}
		h.Audit.RecordFailure(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "pod.router.clone",
			TargetKind:       "vm",
			Metadata: map[string]any{
				"target_folder_id":    targetFolderID.String(),
				"network_number":      networkNumber,
				"network_profile_key": profileKey,
				"requested_vmid":      requestedVMID,
			},
		}, reqErr.UserMessage)
	}
	defer func() {
		if !provisioned {
			h.cleanupFailedPodProvision(uuid.Nil, created)
		}
	}()

	created = make(map[int]clonedVM, 1)
	createdVM, reqErr := h.cloneTemplateIntoPod(
		c.Request.Context(),
		principalID,
		placement,
		targetNode,
		podCloneSpec{
			TemplateItemID: h.RouterTemplateItemID,
			Name:           "router",
			Router:         true,
		},
		cloneVMOptions{
			requestedVMID: &requestedVMID,
			onStarted: func(clone clonedVM) {
				created[clone.VMID] = clone
			},
			onSynced: func(clone clonedVM) {
				created[clone.VMID] = clone
			},
		},
	)
	if reqErr != nil {
		recordFailure(reqErr)
		httpx.WriteRequestError(c, reqErr)
		return
	}

	targets := []podNetworkVMTarget{createdVM.target}
	if reqErr := h.waitForPodVMTargetsReady(c.Request.Context(), targets); reqErr != nil {
		recordFailure(reqErr)
		httpx.WriteRequestError(c, reqErr)
		return
	}

	if reqErr := h.configureProfileNetworkAttachments(
		c.Request.Context(),
		cloneTarget,
		profileKey,
		networkNumber,
		targets,
		map[string]string{},
	); reqErr != nil {
		recordFailure(reqErr)
		httpx.WriteRequestError(c, reqErr)
		return
	}

	cloudInitConfig, err := buildRouterCloudInitConfigForProfile(networkNumber, profileKey, cloneTarget)
	if err != nil {
		reqErr := &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to build router cloud-init configuration",
			Operation:   "build cloned router cloud-init configuration",
			Err:         err,
		}
		recordFailure(reqErr)
		httpx.WriteRequestError(c, reqErr)
		return
	}

	if reqErr := h.configurePodRouterCloudInit(c.Request.Context(), cloudInitConfig, targets); reqErr != nil {
		recordFailure(reqErr)
		httpx.WriteRequestError(c, reqErr)
		return
	}

	vnetNames, err := h.NetworkCatalog.RequiredVNets(cloneTarget.Network(), profileKey)
	if err != nil {
		reqErr := &httpx.RequestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to resolve pod router VNets",
			Operation:   "resolve pod router clone VNets",
			Err:         err,
		}
		recordFailure(reqErr)
		httpx.WriteRequestError(c, reqErr)
		return
	}

	provisioned = true

	if h.Audit != nil {
		itemID := createdVM.response.ItemID
		h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "pod.router.clone",
			TargetKind:       "vm",
			InventoryItemID:  &itemID,
			Metadata: map[string]any{
				"target_folder_id":    targetFolderID.String(),
				"network_number":      networkNumber,
				"network_profile_key": profileKey,
				"clone_target_key":    cloneTarget.Key,
				"vmid":                createdVM.response.VMID,
				"vnets":               vnetNames,
			},
		})
	}

	c.JSON(http.StatusCreated, podRouterCloneResponse{
		VMID:              createdVM.response.VMID,
		ItemID:            createdVM.response.ItemID,
		Item:              createdVM.response.Item,
		TargetFolderID:    targetFolderID,
		NetworkNumber:     networkNumber,
		NetworkProfileKey: profileKey,
		CloneTargetKey:    cloneTarget.Key,
		VNets:             vnetNames,
	})
}
