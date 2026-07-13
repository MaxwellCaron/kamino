package handlers

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

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

	profileKey, automatedNetworking, err := h.resolveCreateNetworkProfile(req)
	if err != nil {
		progress.fail(err.Error())
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "resolve pod network profile", err)
		return
	}

	segmentByTarget := segmentAssignmentsFromSpecs(specs)
	if automatedNetworking {
		if err := h.NetworkCatalog.ValidateAssignments(profileKey, 1, segmentByTarget); err != nil {
			progress.fail(err.Error())
			writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate pod network assignments", err)
			return
		}
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

	var devBatch *vmidalloc.Batch
	var created map[int]clonedVM
	provisioned := false
	defer func() {
		if !provisioned {
			h.cleanupFailedPodProvision(podFolderID, created)
		}
		devBatch.Release()
	}()

	if !requireInventoryPermission(c, h.Authz, principalID, podFolderID, authorization.CreateFolder) {
		progress.fail("forbidden")
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
		writeInventoryError(c, err)
		return
	}

	if len(specs) > 0 {
		if !requireInventoryPermission(c, h.Authz, principalID, vmFolderID, authorization.CreateVM) {
			progress.fail("forbidden")
			return
		}
		reservation, err := h.Service.ReserveFolderVMCapacity(c.Request.Context(), vmFolderID, int32(len(specs)), "pod_create_vms")
		if err != nil {
			progress.fail(inventoryRequestError(err).UserMessage)
			writeInventoryError(c, err)
			return
		}
		if reservation != nil {
			defer reservation.Release(c.Request.Context())
		}
	}

	var devNetworkNumber int32
	if automatedNetworking {
		progress.set(createProgressStepNetwork, "Reserving a dev network.")
		allocation, err := database.New(h.DB).InsertPodDevNetworkAllocation(
			c.Request.Context(),
			database.InsertPodDevNetworkAllocationParams{
				PodFolderID:       podFolderID,
				MinNetworkNumber:  h.RouterCloneConfig.DevNetworkMin,
				MaxNetworkNumber:  h.RouterCloneConfig.DevNetworkMax,
				NetworkProfileKey: &profileKey,
			},
		)
		if errors.Is(err, pgx.ErrNoRows) {
			progress.fail("no pod dev network numbers available")
			writeConflict(c, "no pod dev network numbers available")
			return
		}
		if err != nil {
			progress.fail("failed to reserve pod dev network")
			writeLoggedError(c, http.StatusInternalServerError, "failed to reserve pod dev network", "insert pod dev network allocation", err)
			return
		}

		devNetworkNumber = allocation.NetworkNumber
		progress.set(createProgressStepNetwork, fmt.Sprintf("Checking dev VNets for profile %s.", profileKey))
		if reqErr := h.ensureProfileVNetsExist(c.Request.Context(), profileKey, devNetworkNumber); reqErr != nil {
			progress.fail(reqErr.UserMessage)
			writeRequestError(c, reqErr)
			return
		}
	}

	createdVMs := make([]createPodVMResponse, 0, len(specs))
	createdTargets := make([]podNetworkVMTarget, 0, len(specs))
	if len(specs) > 0 {
		var batchErr error
		devBatch, batchErr = h.Allocator.NewBatch(c.Request.Context(), h.DevVMIDRange, len(specs))
		if batchErr != nil {
			progress.fail("insufficient VMID capacity in the dev range")
			writeLoggedError(c, http.StatusBadGateway, fmt.Sprintf("insufficient VMID capacity in dev range (%d–%d) for %d VMs", h.DevVMIDRange.Min, h.DevVMIDRange.Max, len(specs)), "allocate dev VMID batch", batchErr)
			return
		}
		created = make(map[int]clonedVM, len(specs))

		placement, err := h.Service.ResolveFolderPlacement(c.Request.Context(), vmFolderID)
		if err != nil {
			progress.fail(inventoryRequestError(err).UserMessage)
			writeInventoryError(c, err)
			return
		}
		targetNode, err := h.resolveCloneTargetNode(c.Request.Context())
		if err != nil {
			progress.fail("failed to resolve target node")
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
				writeRequestError(c, reqErr)
				return
			}
			createdVMs = append(createdVMs, createdVM.response)
			createdTargets = append(createdTargets, createdVM.target)
		}

		progress.set(createProgressStepWaiting, "Preparing cloned virtual machines.")
		if reqErr := h.waitForPodVMTargetsReady(c.Request.Context(), createdTargets); reqErr != nil {
			progress.fail(reqErr.UserMessage)
			writeRequestError(c, reqErr)
			return
		}
		if automatedNetworking {
			progress.set(createProgressStepConfiguring, "Configuring dev network attachments.")
			if reqErr := h.configureProfileNetworkAttachments(
				c.Request.Context(),
				profileKey,
				devNetworkNumber,
				createdTargets,
				segmentByTarget,
			); reqErr != nil {
				progress.fail(reqErr.UserMessage)
				writeRequestError(c, reqErr)
				return
			}

			if err := h.persistDevNetworkAssignments(
				c.Request.Context(),
				database.New(h.DB),
				podFolderID,
				createdTargets,
				segmentByTarget,
			); err != nil {
				progress.fail("failed to save pod network assignments")
				writeLoggedError(c, http.StatusInternalServerError, "failed to save pod network assignments", "insert pod dev vm network assignments", err)
				return
			}

			cloudInitConfig, err := buildRouterCloudInitConfigForProfile(devNetworkNumber, profileKey, h.RouterCloneConfig)
			if err != nil {
				progress.fail("failed to build router cloud-init configuration")
				writeLoggedError(c, http.StatusInternalServerError, "failed to build router cloud-init configuration", "build cloned router cloud-init configuration", err)
				return
			}

			progress.set(createProgressStepRouter, "Starting router.")
			if reqErr := h.configurePodRouterCloudInit(c.Request.Context(), cloudInitConfig, createdTargets); reqErr != nil {
				progress.fail(reqErr.UserMessage)
				writeRequestError(c, reqErr)
				return
			}
		}
	}

	provisioned = true
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
