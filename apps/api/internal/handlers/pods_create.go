package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (h *PodsHandler) GetCreateProgress(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	progressID := strings.TrimSpace(c.Param("id"))
	if progressID == "" {
		writeInvalidRequest(c, "invalid progress id")
		return
	}

	snapshot, ok := createPodProgress.get(progressID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "progress not found"})
		return
	}

	c.JSON(http.StatusOK, snapshot)
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

type podNameAvailabilityResponse struct {
	Available bool `json:"available"`
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

type createPodVMResult struct {
	response createPodVMResponse
	target   podNetworkVMTarget
}

type createPodResponse struct {
	OK       bool                  `json:"ok"`
	FolderID uuid.UUID             `json:"folder_id"`
	VMs      []createPodVMResponse `json:"vms"`
}

type podCloneSpec struct {
	TemplateItemID uuid.UUID
	Name           string
	Router         bool
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
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	templatesFolderID, found, err := h.resolveTemplatesFolderID(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load templates", "find pod template folder", err)
		return
	}
	if !found {
		c.JSON(http.StatusOK, podCreateOptionsResponse{
			RouterTemplateConfigured: h.RouterTemplateItemID != uuid.Nil,
			Templates:                []podTemplateOption{},
		})
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
		if row.ParentID == nil || *row.ParentID != templatesFolderID {
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

func (h *PodsHandler) ValidateCreateName(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	name := names.Normalize(c.Query("name"))
	if err := names.ValidateFolder(name); err != nil {
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate pod folder name", err)
		return
	}

	podsFolderID, found, err := h.resolvePodsFolderID(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to validate pod name", "find pods folder for name validation", err)
		return
	}
	if !found {
		c.JSON(http.StatusOK, podNameAvailabilityResponse{Available: true})
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateFolder) {
		return
	}

	exists, err := h.Service.ChildFolderExists(c.Request.Context(), podsFolderID, name)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to validate pod name", "check pod folder name availability", err)
		return
	}

	c.JSON(http.StatusOK, podNameAvailabilityResponse{Available: !exists})
}

func (h *PodsHandler) Create(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	progress := newCreatePodProgressReporter(c.Query("progress_id"))
	progress.set(createProgressStepValidating, "Checking Pod name and selected templates.")

	var req createPodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		progress.fail("invalid request body")
		writeInvalidRequest(c, "invalid request body")
		return
	}

	req.Name = names.Normalize(req.Name)
	if err := names.ValidateFolder(req.Name); err != nil {
		progress.fail(err.Error())
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate pod folder name", err)
		return
	}

	specs, err := h.buildCloneSpecs(req)
	if err != nil {
		progress.fail(err.Error())
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "build pod clone specs", err)
		return
	}

	progress.set(createProgressStepFolders, "Creating Pod inventory folders.")
	podsFolderID, err := h.ensurePodsFolderID(c.Request.Context())
	if err != nil {
		if errors.Is(err, errConfiguredPodsFolderMissing) {
			progress.fail(err.Error())
			writeLoggedError(c, http.StatusConflict, err.Error(), "ensure pods folder", err)
			return
		}
		progress.fail(inventoryRequestError(err).UserMessage)
		writeInventoryError(c, err)
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateFolder) {
		progress.fail("forbidden")
		return
	}
	if len(specs) > 0 && !requireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateVM) {
		progress.fail("forbidden")
		return
	}

	podFolderID, err := h.Service.CreateFolder(c.Request.Context(), podsFolderID, req.Name)
	if err != nil {
		progress.fail(inventoryRequestError(err).UserMessage)
		writeInventoryError(c, err)
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, podFolderID, authorization.CreateFolder) {
		progress.fail("forbidden")
		h.cleanupFailedPodProvision(podFolderID, nil)
		return
	}

	vmFolderID, err := h.Service.EnsureChildFolderWithDescription(
		c.Request.Context(),
		podFolderID,
		podVirtualMachinesFolderName,
		new(inventory.PurposePodVirtualMachinesFolderDescription),
	)
	if err != nil {
		progress.fail(inventoryRequestError(err).UserMessage)
		h.cleanupFailedPodProvision(podFolderID, nil)
		writeInventoryError(c, err)
		return
	}

	if len(specs) > 0 {
		if !requireInventoryPermission(c, h.Authz, principalID, vmFolderID, authorization.CreateVM) {
			progress.fail("forbidden")
			h.cleanupFailedPodProvision(podFolderID, nil)
			return
		}
		reservation, err := h.Service.ReserveFolderVMCapacity(c.Request.Context(), vmFolderID, int32(len(specs)), "pod_create_vms")
		if err != nil {
			progress.fail(inventoryRequestError(err).UserMessage)
			h.cleanupFailedPodProvision(podFolderID, nil)
			writeInventoryError(c, err)
			return
		}
		if reservation != nil {
			defer reservation.Release(c.Request.Context())
		}
	}

	var devNetworkNumber int32
	if req.IncludeRouter {
		progress.set(createProgressStepNetwork, "Reserving a dev network.")
		allocation, err := database.New(h.DB).InsertPodDevNetworkAllocation(
			c.Request.Context(),
			database.InsertPodDevNetworkAllocationParams{
				PodFolderID:      podFolderID,
				MinNetworkNumber: h.RouterCloneConfig.DevNetworkMin,
				MaxNetworkNumber: h.RouterCloneConfig.DevNetworkMax,
			},
		)
		if errors.Is(err, pgx.ErrNoRows) {
			progress.fail("no pod dev network numbers available")
			h.cleanupFailedPodProvision(podFolderID, nil)
			writeConflict(c, "no pod dev network numbers available")
			return
		}
		if err != nil {
			progress.fail("failed to reserve pod dev network")
			h.cleanupFailedPodProvision(podFolderID, nil)
			writeLoggedError(c, http.StatusInternalServerError, "failed to reserve pod dev network", "insert pod dev network allocation", err)
			return
		}

		devNetworkNumber = allocation.NetworkNumber
		vnetName := h.podVNetName(devNetworkNumber)
		progress.set(createProgressStepNetwork, fmt.Sprintf("Checking dev VNet %s.", vnetName))
		if reqErr := h.ensurePodVNetExists(c.Request.Context(), vnetName); reqErr != nil {
			progress.fail(reqErr.UserMessage)
			h.cleanupFailedPodProvision(podFolderID, nil)
			writeRequestError(c, reqErr)
			return
		}
	}

	createdVMs := make([]createPodVMResponse, 0, len(specs))
	createdTargets := make([]podNetworkVMTarget, 0, len(specs))
	created := make(map[int]clonedVM, len(specs))
	if len(specs) > 0 {
		devBatch, batchErr := h.Allocator.NewBatch(c.Request.Context(), h.DevVMIDRange, len(specs))
		if batchErr != nil {
			progress.fail("insufficient VMID capacity in the dev range")
			h.cleanupFailedPodProvision(podFolderID, created)
			writeLoggedError(c, http.StatusBadGateway, fmt.Sprintf("insufficient VMID capacity in dev range (%d–%d) for %d VMs", h.DevVMIDRange.Min, h.DevVMIDRange.Max, len(specs)), "allocate dev VMID batch", batchErr)
			return
		}

		placement, err := h.Service.ResolveFolderPlacement(c.Request.Context(), vmFolderID)
		if err != nil {
			progress.fail(inventoryRequestError(err).UserMessage)
			h.cleanupFailedPodProvision(podFolderID, created)
			writeInventoryError(c, err)
			return
		}
		targetNode, err := h.resolveCloneTargetNode(c.Request.Context())
		if err != nil {
			progress.fail("failed to resolve target node")
			h.cleanupFailedPodProvision(podFolderID, created)
			writeLoggedError(c, http.StatusBadGateway, "failed to resolve target node", "resolve pod clone target node", err)
			return
		}

		for _, spec := range specs {
			message := fmt.Sprintf("Cloning %s into the Pod.", spec.Name)
			if spec.Router {
				message = "Cloning router into the Pod."
			}
			progress.set(createProgressStepCloning, message)

			createdVM, reqErr := h.cloneTemplateIntoPod(
				c.Request.Context(),
				principalID,
				placement,
				targetNode,
				spec,
				cloneVMOptions{
					batch: devBatch,
					onStarted: func(node string, vmid int) {
						created[vmid] = clonedVM{
							TargetNode: node,
							VMID:       vmid,
						}
					},
					onSynced: func(clone clonedVM) {
						created[clone.VMID] = clone
					},
				},
			)
			if reqErr != nil {
				progress.fail(reqErr.UserMessage)
				h.cleanupFailedPodProvision(podFolderID, created)
				writeRequestError(c, reqErr)
				return
			}
			createdVMs = append(createdVMs, createdVM.response)
			createdTargets = append(createdTargets, createdVM.target)
		}

		progress.set(createProgressStepWaiting, "Preparing cloned virtual machines.")
		if reqErr := h.waitForPodVMTargetsReady(c.Request.Context(), createdTargets); reqErr != nil {
			progress.fail(reqErr.UserMessage)
			h.cleanupFailedPodProvision(podFolderID, created)
			writeRequestError(c, reqErr)
			return
		}
		if req.IncludeRouter {
			devVNetName := h.podVNetName(devNetworkNumber)
			progress.set(createProgressStepConfiguring, "Configuring dev VNet bridges.")
			if reqErr := h.configurePodVNetBridges(c.Request.Context(), devVNetName, createdTargets); reqErr != nil {
				progress.fail(reqErr.UserMessage)
				h.cleanupFailedPodProvision(podFolderID, created)
				writeRequestError(c, reqErr)
				return
			}

			cloudInitConfig, err := buildClonedRouterCloudInitConfig(devNetworkNumber, h.RouterCloneConfig)
			if err != nil {
				progress.fail("failed to build router cloud-init configuration")
				h.cleanupFailedPodProvision(podFolderID, created)
				writeLoggedError(c, http.StatusInternalServerError, "failed to build router cloud-init configuration", "build cloned router cloud-init configuration", err)
				return
			}

			progress.set(createProgressStepRouter, "Starting router.")
			if reqErr := h.configurePodRouterCloudInit(c.Request.Context(), cloudInitConfig, createdTargets); reqErr != nil {
				progress.fail(reqErr.UserMessage)
				h.cleanupFailedPodProvision(podFolderID, created)
				writeRequestError(c, reqErr)
				return
			}
		}
	}

	progress.succeed("Pod created successfully.")
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.create",
		TargetKind:       "folder",
		InventoryItemID:  &podFolderID,
		Metadata:         map[string]any{"name": req.Name},
	})
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
			Router:         true,
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
	placement inventory.FolderPlacement,
	targetNode string,
	spec podCloneSpec,
	opts cloneVMOptions,
) (createPodVMResult, *requestError) {
	item, err := h.Service.GetInventoryItemByID(ctx, spec.TemplateItemID)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return createPodVMResult{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "configured pod template was not found",
			Operation:   "load pod template inventory item",
			Err:         err,
		}
	default:
		return createPodVMResult{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load template",
			Operation:   "load pod template inventory item",
			Err:         err,
		}
	}
	if item.IsTemplate == nil || !*item.IsTemplate {
		return createPodVMResult{}, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: "selected VM is not a template",
		}
	}

	clone, reqErr := h.cloneVMIntoFolder(ctx, principalID, spec.TemplateItemID, placement, targetNode, spec.Name, false, opts)
	if reqErr != nil {
		return createPodVMResult{}, reqErr
	}

	if spec.Hardware != nil {
		if err := h.applyCloneHardware(ctx, targetNode, clone.VMID, clone.InventoryItemID, *spec.Hardware); err != nil {
			return createPodVMResult{}, &requestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: err.Error(),
				Operation:   "apply pod clone hardware",
				Err:         err,
			}
		}
	}

	h.Service.NotifyInventoryChanged(ctx, clone.InventoryItemID)

	clonedItem, err := h.Service.GetInventoryItemWithPermissions(ctx, principalID, clone.InventoryItemID)
	if err != nil {
		return createPodVMResult{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "vm cloned in Proxmox but failed to load inventory item",
			Operation:   "load pod clone inventory item",
			Err:         err,
		}
	}

	return createPodVMResult{
		response: createPodVMResponse{
			TemplateItemID: spec.TemplateItemID,
			VMID:           clone.VMID,
			ItemID:         clone.InventoryItemID,
			Item:           buildInventoryItem(clonedItem),
		},
		target: podNetworkVMTarget{
			name:   spec.Name,
			clone:  clone,
			router: spec.Router,
		},
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
