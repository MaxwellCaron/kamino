package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const podsFolderName = "Pods"

type PodsHandler struct {
	PX                   *proxmox.Client
	Importer             *proxmox.InventoryImporter
	Service              *inventory.Service
	Authz                *authorization.Service
	RouterTemplateItemID uuid.UUID
}

type podTemplateOption struct {
	ID               uuid.UUID `json:"id"`
	Name             string    `json:"name"`
	Node             string    `json:"node"`
	VMID             int32     `json:"vmid"`
	CPUCount         *int32    `json:"cpu_count,omitempty"`
	MemoryMB         *int32    `json:"memory_mb,omitempty"`
	DiskGB           *float64  `json:"disk_gb,omitempty"`
	IsRouterTemplate bool      `json:"is_router_template"`
}

type podCreateOptionsResponse struct {
	RouterTemplateConfigured bool                `json:"router_template_configured"`
	Templates                []podTemplateOption `json:"templates"`
}

type createPodVMRequest struct {
	Name      string `json:"name" binding:"required"`
	CPUCount  int    `json:"cpu_count"`
	MemoryGB  int    `json:"memory_gb"`
	StorageGB int    `json:"storage_gb"`
}

type createPodTemplateRequest struct {
	TemplateItemID string               `json:"template_item_id" binding:"required"`
	VMs            []createPodVMRequest `json:"vms" binding:"required,min=1"`
}

type createPodRequest struct {
	Name          string                     `json:"name" binding:"required"`
	IncludeRouter bool                       `json:"include_router"`
	Templates     []createPodTemplateRequest `json:"templates"`
}

type createPodVMResponse struct {
	TemplateItemID uuid.UUID     `json:"template_item_id"`
	VMID           int           `json:"vmid"`
	ItemID         uuid.UUID     `json:"item_id"`
	Item           InventoryItem `json:"item"`
}

type createPodResponse struct {
	OK       bool                  `json:"ok"`
	FolderID uuid.UUID             `json:"folder_id"`
	VMs      []createPodVMResponse `json:"vms"`
}

type podCloneSpec struct {
	TemplateItemID uuid.UUID
	Name           string
	Hardware       *podCloneHardware
}

type podCloneHardware struct {
	CPUCount  int
	MemoryGB  int
	StorageGB int
}

func (h *PodsHandler) GetCreateOptions(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	rows, err := h.Service.GetVisibleInventoryItems(c.Request.Context(), principalID)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load templates", "load pod template options", err)
		return
	}

	templates := make([]podTemplateOption, 0)
	for _, row := range rows {
		if row.Kind != database.InventoryItemKindVm || row.IsTemplate == nil || !*row.IsTemplate {
			continue
		}
		if row.Node == nil || row.Vmid == nil {
			continue
		}

		allowed, err := h.Authz.Has(c.Request.Context(), principalID, row.ID, authorization.CloneVM)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize pod template option", err)
			return
		}
		if !allowed {
			continue
		}

		isRouterTemplate := h.RouterTemplateItemID != uuid.Nil && row.ID == h.RouterTemplateItemID
		if isRouterTemplate {
			continue
		}

		templates = append(templates, podTemplateOption{
			ID:               row.ID,
			Name:             row.Name,
			Node:             *row.Node,
			VMID:             *row.Vmid,
			CPUCount:         row.CpuCount,
			MemoryMB:         row.MemoryMb,
			DiskGB:           row.DiskGb,
			IsRouterTemplate: isRouterTemplate,
		})
	}

	c.JSON(http.StatusOK, podCreateOptionsResponse{
		RouterTemplateConfigured: h.RouterTemplateItemID != uuid.Nil,
		Templates:                templates,
	})
}

func (h *PodsHandler) Create(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	var req createPodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	req.Name = names.Normalize(req.Name)
	if err := names.ValidateFolder(req.Name); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	specs, err := h.buildCloneSpecs(req)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	podsFolderID, err := h.Service.EnsureFolderPath(c.Request.Context(), []string{podsFolderName})
	if err != nil {
		writeInventoryError(c, err)
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateFolder) {
		return
	}
	if len(specs) > 0 && !requireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateVM) {
		return
	}

	podFolderID, err := h.Service.CreateFolder(c.Request.Context(), podsFolderID, req.Name)
	if err != nil {
		writeInventoryError(c, err)
		return
	}

	if len(specs) > 0 {
		if !requireInventoryPermission(c, h.Authz, principalID, podFolderID, authorization.CreateVM) {
			return
		}
		if err := h.Service.EnsureFolderHasVMCapacity(c.Request.Context(), podFolderID, int32(len(specs))); err != nil {
			writeInventoryError(c, err)
			return
		}
	}

	createdVMs := make([]createPodVMResponse, 0, len(specs))
	for _, spec := range specs {
		created, reqErr := h.cloneTemplateIntoPod(c.Request.Context(), principalID, podFolderID, spec)
		if reqErr != nil {
			writeRequestError(c, reqErr)
			return
		}
		createdVMs = append(createdVMs, created)
	}

	c.JSON(http.StatusOK, createPodResponse{
		OK:       true,
		FolderID: podFolderID,
		VMs:      createdVMs,
	})
}

func (h *PodsHandler) buildCloneSpecs(req createPodRequest) ([]podCloneSpec, error) {
	specs := make([]podCloneSpec, 0)

	if req.IncludeRouter {
		if h.RouterTemplateItemID == uuid.Nil {
			return nil, fmt.Errorf("router template is not configured")
		}
		specs = append(specs, podCloneSpec{
			TemplateItemID: h.RouterTemplateItemID,
			Name:           "router",
		})
	}

	for _, template := range req.Templates {
		templateID, err := uuid.Parse(template.TemplateItemID)
		if err != nil {
			return nil, fmt.Errorf("invalid template_item_id")
		}

		for _, vm := range template.VMs {
			name := names.Normalize(vm.Name)
			if err := names.ValidateVM(name); err != nil {
				return nil, err
			}
			if vm.CPUCount < 1 || vm.CPUCount > 8 {
				return nil, fmt.Errorf("CPU must be between 1 and 8 vCPU")
			}
			if vm.MemoryGB < 1 || vm.MemoryGB > 32 {
				return nil, fmt.Errorf("memory must be between 1 and 32 GB")
			}
			if vm.StorageGB < 10 || vm.StorageGB > 100 {
				return nil, fmt.Errorf("storage must be between 10 and 100 GB")
			}

			specs = append(specs, podCloneSpec{
				TemplateItemID: templateID,
				Name:           name,
				Hardware: &podCloneHardware{
					CPUCount:  vm.CPUCount,
					MemoryGB:  vm.MemoryGB,
					StorageGB: vm.StorageGB,
				},
			})
		}
	}

	return specs, nil
}

func (h *PodsHandler) cloneTemplateIntoPod(
	ctx context.Context,
	principalID uuid.UUID,
	podFolderID uuid.UUID,
	spec podCloneSpec,
) (createPodVMResponse, *requestError) {
	source, reqErr := resolveVerifiedVMItemPermission(
		ctx,
		h.Authz,
		h.PX,
		principalID,
		spec.TemplateItemID,
		authorization.CloneVM,
		true,
	)
	if reqErr != nil {
		return createPodVMResponse{}, reqErr
	}

	item, err := h.Service.GetInventoryItemByID(ctx, spec.TemplateItemID)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return createPodVMResponse{}, &requestError{Status: http.StatusNotFound, UserMessage: "template not found"}
	default:
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load template",
			Operation:   "load pod template inventory item",
			Err:         err,
		}
	}
	if item.IsTemplate == nil || !*item.IsTemplate {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "selected VM is not a template",
		}
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, podFolderID)
	if err != nil {
		return createPodVMResponse{}, inventoryRequestError(err)
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve pod clone target node",
			Err:         err,
		}
	}

	newID, err := h.PX.GetNextVMID(ctx)
	if err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to fetch next VMID",
			Operation:   "fetch pod clone vmid",
			Err:         err,
		}
	}

	if err := h.PX.CloneVM(ctx, source.Node, source.VMID, newID, spec.Name, false, targetNode); err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to clone VM",
			Operation:   "clone pod template",
			Err:         err,
		}
	}

	if err := h.PX.SetVMUpstreamUUID(ctx, targetNode, newID, uuid.New()); err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to assign clone identity",
			Operation:   "assign pod clone identity",
			Err:         err,
		}
	}

	if err := h.PX.SyncVMPoolMembership(ctx, targetNode, newID, placement.PoolID, placement.Path); err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to sync VM pool membership",
			Operation:   "sync pod clone pool membership",
			Err:         err,
		}
	}

	clonedItemID, err := h.Importer.SyncVM(ctx, placement.FolderID, targetNode, newID)
	if err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "vm cloned in Proxmox but failed to sync inventory metadata",
			Operation:   "sync pod clone inventory metadata",
			Err:         err,
		}
	}

	if spec.Hardware != nil {
		if err := h.applyCloneHardware(ctx, targetNode, newID, clonedItemID, *spec.Hardware); err != nil {
			return createPodVMResponse{}, &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: err.Error(),
				Operation:   "apply pod clone hardware",
				Err:         err,
			}
		}
	}

	h.Service.NotifyInventoryChanged(ctx, clonedItemID)

	clonedItem, err := h.Service.GetInventoryItemWithPermissions(ctx, principalID, clonedItemID)
	if err != nil {
		return createPodVMResponse{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "vm cloned in Proxmox but failed to load inventory item",
			Operation:   "load pod clone inventory item",
			Err:         err,
		}
	}

	return createPodVMResponse{
		TemplateItemID: spec.TemplateItemID,
		VMID:           newID,
		ItemID:         clonedItemID,
		Item:           buildInventoryItem(clonedItem),
	}, nil
}

func (h *PodsHandler) resolveCloneTargetNode(ctx context.Context) (string, error) {
	optimalNode, err := h.PX.GetOptimalNode(ctx)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(optimalNode.Node), nil
}

func (h *PodsHandler) applyCloneHardware(
	ctx context.Context,
	node string,
	vmid int,
	itemID uuid.UUID,
	hardware podCloneHardware,
) error {
	config, err := h.PX.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return fmt.Errorf("failed to load cloned VM hardware")
	}

	config.Sockets = 1
	config.Cores = hardware.CPUCount
	config.Memory = hardware.MemoryGB
	if config.Balloon > config.Memory {
		config.Balloon = config.Memory
	}
	if hardware.StorageGB > config.DiskSize {
		config.DiskSize = hardware.StorageGB
	}

	if err := h.PX.UpdateVMHardware(ctx, node, vmid, *config); err != nil {
		return err
	}

	return h.Service.UpdateInventoryVMHardwareSummary(
		ctx,
		itemID,
		int32(config.Sockets*config.Cores),
		int32(config.Memory*1024),
		float64(config.DiskSize),
	)
}

func inventoryRequestError(err error) *requestError {
	status := http.StatusInternalServerError
	message := "inventory mutation failed"

	switch {
	case errors.Is(err, inventory.ErrInventoryItemNotFound),
		errors.Is(err, inventory.ErrInventoryFolderNotFound),
		errors.Is(err, inventory.ErrInventoryParentNotFound):
		status = http.StatusNotFound
		message = err.Error()
	case errors.Is(err, inventory.ErrInventoryTargetNotFolder),
		errors.Is(err, inventory.ErrInventoryItemNotFolder),
		errors.Is(err, inventory.ErrInventoryFolderDepthExceeded),
		errors.Is(err, inventory.ErrInventoryInvalidFolderLimit),
		errors.Is(err, names.ErrRequired),
		errors.Is(err, names.ErrTooLong),
		errors.Is(err, names.ErrMustStartWithLetter),
		errors.Is(err, names.ErrInvalidCharacters):
		status = http.StatusUnprocessableEntity
		message = err.Error()
	case errors.Is(err, inventory.ErrInventoryInvalidMove),
		errors.Is(err, inventory.ErrInventoryReservedFolder),
		errors.Is(err, inventory.ErrInventoryFolderConflict),
		errors.Is(err, inventory.ErrInventoryFolderLimitExceeded):
		status = http.StatusConflict
		message = err.Error()
	}

	return &requestError{
		Status:      status,
		UserMessage: message,
	}
}
