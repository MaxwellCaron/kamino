package pods

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/handlers/inventoryview"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/podnetworkallocation"
	"github.com/MaxwellCaron/kamino/internal/podprogress"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

func (h *PodsHandler) Create(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}
	if !httpx.RequireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	progress := h.Progress.CreateReporter(c.Query("progress_id"))
	progress.Set(podprogress.CreateStepValidating, "Checking Pod name and selected templates.")

	var req createPodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		progress.Fail("invalid request body")
		httpx.WriteInvalidRequest(c, "invalid request body")
		return
	}

	req.Name = names.Normalize(req.Name)
	if err := names.ValidateFolder(req.Name); err != nil {
		progress.Fail(err.Error())
		httpx.WriteLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate pod folder name", err)
		return
	}

	specs, err := h.buildCloneSpecs(req)
	if err != nil {
		progress.Fail(err.Error())
		httpx.WriteLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "build pod clone specs", err)
		return
	}

	profileKey, automatedNetworking, err := h.resolveCreateNetworkProfile(req)
	if err != nil {
		progress.Fail(err.Error())
		httpx.WriteLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "resolve pod network profile", err)
		return
	}

	var devCloneTarget podCloneTarget
	if automatedNetworking {
		var reqErr *httpx.RequestError
		devCloneTarget, reqErr = h.resolvePodCloneTarget(c.Request.Context(), req.CloneTargetKey)
		if reqErr != nil {
			progress.Fail(reqErr.UserMessage)
			httpx.WriteRequestError(c, reqErr)
			return
		}
		if !devCloneTarget.SupportsProfile(h.NetworkCatalog, profileKey) {
			message := fmt.Sprintf(
				"clone target %s does not support the %s network profile",
				devCloneTarget.Label,
				profileKey,
			)
			progress.Fail(message)
			httpx.WriteRequestError(c, &httpx.RequestError{
				Status:      http.StatusUnprocessableEntity,
				UserMessage: message,
			})
			return
		}
	}

	segmentByTarget := segmentAssignmentsFromSpecs(specs)
	if automatedNetworking {
		if err := h.NetworkCatalog.ValidateAssignments(profileKey, 1, segmentByTarget); err != nil {
			progress.Fail(err.Error())
			httpx.WriteLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate pod network assignments", err)
			return
		}
	}

	progress.Set(podprogress.CreateStepFolders, "Creating Pod inventory folders.")
	podsFolderID, err := h.ensurePodsFolderID(c.Request.Context())
	if err != nil {
		if errors.Is(err, errConfiguredPodsFolderMissing) {
			progress.Fail(err.Error())
			httpx.WriteLoggedError(c, http.StatusConflict, err.Error(), "ensure pods folder", err)
			return
		}
		progress.Fail(inventoryRequestError(err).UserMessage)
		inventoryview.WriteInventoryError(c, err)
		return
	}
	if !httpx.RequireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateFolder) {
		progress.Fail("forbidden")
		return
	}
	if len(specs) > 0 && !httpx.RequireInventoryPermission(c, h.Authz, principalID, podsFolderID, authorization.CreateVM) {
		progress.Fail("forbidden")
		return
	}

	podFolderID, err := h.Service.CreateFolder(c.Request.Context(), podsFolderID, req.Name)
	if err != nil {
		progress.Fail(inventoryRequestError(err).UserMessage)
		inventoryview.WriteInventoryError(c, err)
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

	if err := h.Service.ReplaceInventoryACL(c.Request.Context(), podFolderID, []inventory.ACLEntryInput{{
		PrincipalID: principalID,
		Effect:      database.InventoryAceEffectAllow,
		Permissions: int64(authorization.FullAccessMask),
	}}); err != nil {
		progress.Fail("failed to apply Pod creator permissions")
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to apply Pod creator permissions", "replace source Pod folder ACL", err)
		return
	}

	if !httpx.RequireInventoryPermission(c, h.Authz, principalID, podFolderID, authorization.CreateFolder) {
		progress.Fail("forbidden")
		return
	}

	vmFolderID, err := h.Service.EnsureChildFolderWithDescription(
		c.Request.Context(),
		podFolderID,
		podVirtualMachinesFolderName,
		new(inventory.PurposePodVirtualMachinesFolderDescription),
	)
	if err != nil {
		progress.Fail(inventoryRequestError(err).UserMessage)
		inventoryview.WriteInventoryError(c, err)
		return
	}

	if len(specs) > 0 {
		if !httpx.RequireInventoryPermission(c, h.Authz, principalID, vmFolderID, authorization.CreateVM) {
			progress.Fail("forbidden")
			return
		}
		reservation, err := h.Service.ReserveFolderVMCapacity(c.Request.Context(), vmFolderID, int32(len(specs)), "pod_create_vms")
		if err != nil {
			progress.Fail(inventoryRequestError(err).UserMessage)
			inventoryview.WriteInventoryError(c, err)
			return
		}
		if reservation != nil {
			defer reservation.Release(c.Request.Context())
		}
	}

	var devNetworkNumber int32
	if automatedNetworking {
		progress.Set(podprogress.CreateStepNetwork, "Reserving a dev network.")
		var allocation database.InsertPodDevNetworkAllocationRow
		err := podnetworkallocation.WithPodNetworkAllocation(c.Request.Context(), h.DB, func(ctx context.Context, tx pgx.Tx) error {
			var err error
			allocation, err = database.New(tx).InsertPodDevNetworkAllocation(
				ctx,
				database.InsertPodDevNetworkAllocationParams{
					PodFolderID:       podFolderID,
					MinNetworkNumber:  devCloneTarget.NetworkMin,
					MaxNetworkNumber:  devCloneTarget.NetworkMax,
					NetworkProfileKey: &profileKey,
					CloneTargetKey:    devCloneTarget.Key,
				},
			)
			return err
		})
		if errors.Is(err, pgx.ErrNoRows) {
			progress.Fail("no pod dev network numbers available")
			httpx.WriteConflict(c, "no pod dev network numbers available")
			return
		}
		if err != nil {
			progress.Fail("failed to reserve pod dev network")
			httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to reserve pod dev network", "insert pod dev network allocation", err)
			return
		}

		devNetworkNumber = allocation.NetworkNumber
		progress.Set(podprogress.CreateStepNetwork, fmt.Sprintf("Checking dev VNets for profile %s.", profileKey))
		if reqErr := h.ensureProfileVNetsExist(c.Request.Context(), devCloneTarget, profileKey); reqErr != nil {
			progress.Fail(reqErr.UserMessage)
			httpx.WriteRequestError(c, reqErr)
			return
		}
	}

	createdVMs := make([]createPodVMResponse, 0, len(specs))
	createdTargets := make([]podNetworkVMTarget, 0, len(specs))
	if len(specs) > 0 {
		var batchErr error
		devBatch, batchErr = h.Allocator.NewBatch(c.Request.Context(), h.DevVMIDRange, len(specs))
		if batchErr != nil {
			progress.Fail("insufficient VMID capacity in the dev range")
			httpx.WriteLoggedError(c, http.StatusBadGateway, fmt.Sprintf("insufficient VMID capacity in dev range (%d–%d) for %d VMs", h.DevVMIDRange.Min, h.DevVMIDRange.Max, len(specs)), "allocate dev VMID batch", batchErr)
			return
		}
		created = make(map[int]clonedVM, len(specs))
		var createdMu sync.Mutex

		placement, err := h.Service.ResolveFolderPlacement(c.Request.Context(), vmFolderID)
		if err != nil {
			progress.Fail(inventoryRequestError(err).UserMessage)
			inventoryview.WriteInventoryError(c, err)
			return
		}
		targetNode, err := h.resolveCloneTargetNode(c.Request.Context())
		if err != nil {
			progress.Fail("failed to resolve target node")
			httpx.WriteLoggedError(c, http.StatusBadGateway, "failed to resolve target node", "resolve pod clone target node", err)
			return
		}

		limit := h.vmOperationConcurrencyLimit()
		progress.Set(podprogress.CreateStepCloning, fmt.Sprintf("Cloning %d virtual machines (up to %d at a time).", len(specs), limit))

		cloneResults, reqErr := runCreatePodClones(c.Request.Context(), limit, specs, func(ctx context.Context, index int, spec podCloneSpec) (createPodVMResult, *httpx.RequestError) {
			return h.cloneTemplateIntoPod(
				ctx,
				principalID,
				placement,
				targetNode,
				spec,
				cloneVMOptions{
					batch: devBatch,
					onStarted: func(clone clonedVM) {
						createdMu.Lock()
						created[clone.VMID] = clone
						createdMu.Unlock()
					},
					onSynced: func(clone clonedVM) {
						createdMu.Lock()
						created[clone.VMID] = clone
						createdMu.Unlock()
					},
				},
			)
		})
		if reqErr != nil {
			progress.Fail(reqErr.UserMessage)
			httpx.WriteRequestError(c, reqErr)
			return
		}

		for _, result := range cloneResults {
			createdVMs = append(createdVMs, result.response)
			createdTargets = append(createdTargets, result.target)
		}

		progress.Set(podprogress.CreateStepWaiting, "Preparing cloned virtual machines.")
		if reqErr := h.waitForPodVMTargetsReady(c.Request.Context(), createdTargets); reqErr != nil {
			progress.Fail(reqErr.UserMessage)
			httpx.WriteRequestError(c, reqErr)
			return
		}
		if automatedNetworking {
			progress.Set(podprogress.CreateStepConfiguring, "Configuring dev network attachments.")
			if reqErr := h.configureProfileNetworkAttachments(
				c.Request.Context(),
				devCloneTarget,
				profileKey,
				devNetworkNumber,
				createdTargets,
				segmentByTarget,
			); reqErr != nil {
				progress.Fail(reqErr.UserMessage)
				httpx.WriteRequestError(c, reqErr)
				return
			}

			if err := h.persistDevNetworkAssignments(
				c.Request.Context(),
				database.New(h.DB),
				podFolderID,
				createdTargets,
				segmentByTarget,
			); err != nil {
				progress.Fail("failed to save pod network assignments")
				httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to save pod network assignments", "insert pod dev vm network assignments", err)
				return
			}

			cloudInitConfig, err := buildRouterCloudInitConfigForProfile(devNetworkNumber, profileKey, devCloneTarget)
			if err != nil {
				progress.Fail("failed to build router cloud-init configuration")
				httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to build router cloud-init configuration", "build cloned router cloud-init configuration", err)
				return
			}

			progress.Set(podprogress.CreateStepRouter, "Starting router.")
			if reqErr := h.configurePodRouterCloudInit(c.Request.Context(), cloudInitConfig, createdTargets); reqErr != nil {
				progress.Fail(reqErr.UserMessage)
				httpx.WriteRequestError(c, reqErr)
				return
			}
		}
	}

	provisioned = true
	progress.Succeed("Pod created successfully.")
	metadata := map[string]any{"name": req.Name}
	if automatedNetworking {
		metadata["clone_target_key"] = devCloneTarget.Key
	}
	h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
		ActorPrincipalID: &principalID,
		ActionKind:       "pod.create",
		TargetKind:       "folder",
		InventoryItemID:  &podFolderID,
		Metadata:         metadata,
	})
	c.JSON(http.StatusOK, createPodResponse{
		OK:       true,
		FolderID: podFolderID,
		VMs:      createdVMs,
	})
}
