package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/names"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const personalPodsFolderName = "Personal-Pods"

type personalPodSummaryResponse struct {
	ID       uuid.UUID                `json:"id"`
	FolderID uuid.UUID                `json:"folder_id"`
	Network  clonedPodNetworkResponse `json:"network"`
}

type personalPodStatusResponse struct {
	Configured       bool                        `json:"configured"`
	CanCreate        bool                        `json:"can_create"`
	PersonalPod      *personalPodSummaryResponse `json:"personal_pod"`
	PendingRequestID *uuid.UUID                  `json:"pending_request_id"`
}

type personalPodCreateResponse struct {
	FolderID uuid.UUID `json:"folder_id"`
}

func (h *PodsHandler) personalPodVNetName(networkNumber int32) string {
	return fmt.Sprintf("%s%d", strings.TrimSpace(h.RouterCloneConfig.PersonalVNetPrefix), networkNumber)
}

func personalPodFolderName(username string) string {
	trimmed := strings.TrimSpace(username)
	var builder strings.Builder
	lastDash := false

	for _, r := range trimmed {
		allowed := unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-'
		if allowed {
			builder.WriteRune(r)
			lastDash = false
			continue
		}
		if lastDash {
			continue
		}
		builder.WriteByte('-')
		lastDash = true
	}

	name := strings.Trim(builder.String(), "-")
	if name == "" || !unicode.IsLetter(rune(name[0])) {
		name = "user-" + name
	}
	if len(name) > 63 {
		name = name[:63]
		name = strings.TrimRight(name, "-")
	}
	if name == "" {
		return "user-"
	}

	return name
}

func (h *PodsHandler) personalPodNetworkMetadata(networkNumber int32) (clonedPodNetworkResponse, error) {
	wanBase, err := routerconfig.NormalizeDottedPrefix(h.RouterCloneConfig.PersonalWANIPBase)
	if err != nil {
		return clonedPodNetworkResponse{}, fmt.Errorf("invalid WAN IP base %q: %w", h.RouterCloneConfig.PersonalWANIPBase, err)
	}

	return clonedPodNetworkResponse{
		Number:          networkNumber,
		VNet:            h.personalPodVNetName(networkNumber),
		ExternalSubnet:  fmt.Sprintf("%s%d.0/24", wanBase, networkNumber),
		ExternalGateway: fmt.Sprintf("%s%d.1", wanBase, networkNumber),
		InternalSubnet:  h.RouterCloneConfig.InternalSubnet.String(),
		InternalGateway: h.RouterCloneConfig.InternalSubnet.Addr().Next().String(),
	}, nil
}

func (h *PodsHandler) provisionPersonalPod(
	ctx context.Context,
	userPrincipalID uuid.UUID,
) (database.PersonalPods, *requestError) {
	if h.PersonalPodRouterTemplateItemID == uuid.Nil {
		return database.PersonalPods{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "personal pods are not configured",
		}
	}

	q := database.New(h.DB)
	if _, err := q.GetPersonalPodByUser(ctx, userPrincipalID); err == nil {
		return database.PersonalPods{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "personal pod already exists",
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return database.PersonalPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to check personal pod",
			Operation:   "check existing personal pod",
			Err:         err,
		}
	}

	principal, err := q.GetPrincipalByID(ctx, userPrincipalID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return database.PersonalPods{}, &requestError{
				Status:      http.StatusNotFound,
				UserMessage: "principal not found",
			}
		}
		return database.PersonalPods{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to load principal",
			Operation:   "load personal pod principal",
			Err:         err,
		}
	}

	username := ""
	if principal.Name != nil {
		username = strings.TrimSpace(*principal.Name)
	}
	if username == "" {
		username = strings.TrimSpace(principal.ExternalID)
	}
	folderName := personalPodFolderName(username)
	if err := names.ValidateFolder(folderName); err != nil {
		return database.PersonalPods{}, &requestError{
			Status:      http.StatusUnprocessableEntity,
			UserMessage: err.Error(),
		}
	}

	rootID, err := h.ensurePersonalPodsFolderID(ctx)
	if err != nil {
		if errors.Is(err, errConfiguredPersonalPodsFolderMissing) {
			return database.PersonalPods{}, &requestError{
				Status:      http.StatusConflict,
				UserMessage: err.Error(),
			}
		}
		return database.PersonalPods{}, inventoryRequestError(err)
	}
	exists, err := h.Service.ChildFolderExists(ctx, rootID, folderName)
	if err != nil {
		return database.PersonalPods{}, inventoryRequestError(err)
	}
	if exists {
		return database.PersonalPods{}, &requestError{
			Status:      http.StatusConflict,
			UserMessage: "personal pod folder already exists",
		}
	}

	folderID, err := h.Service.CreateFolder(ctx, rootID, folderName)
	if err != nil {
		return database.PersonalPods{}, inventoryRequestError(err)
	}

	recordFailure := func(reqErr *requestError) {
		if reqErr == nil || h.Audit == nil {
			return
		}
		h.Audit.RecordFailure(ctx, audit.EventParams{
			ActorPrincipalID: &userPrincipalID,
			ActionKind:       "personal_pod.create",
			TargetKind:       "folder",
			InventoryItemID:  &folderID,
		}, reqErr.UserMessage)
	}

	if err := h.Service.ReplaceInventoryACL(ctx, folderID, []inventory.ACLEntryInput{{
		PrincipalID: userPrincipalID,
		Effect:      database.InventoryAceEffectAllow,
		Permissions: int64(authorization.FullAccessMask),
	}}); err != nil {
		reqErr := &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to apply personal pod permissions",
			Operation:   "replace personal pod folder ACL",
			Err:         err,
		}
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, nil)
		return database.PersonalPods{}, reqErr
	}

	personalPod, err := q.InsertPersonalPod(ctx, database.InsertPersonalPodParams{
		ID:               uuid.New(),
		UserPrincipalID:  userPrincipalID,
		FolderID:         folderID,
		MinNetworkNumber: h.RouterCloneConfig.PersonalNetworkMin,
		MaxNetworkNumber: h.RouterCloneConfig.PersonalNetworkMax,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		reqErr := &requestError{
			Status:      http.StatusConflict,
			UserMessage: "no personal pod network numbers available",
		}
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, nil)
		return database.PersonalPods{}, reqErr
	}
	if err != nil {
		reqErr := &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to reserve personal pod network number",
			Operation:   "insert personal pod network allocation",
			Err:         err,
		}
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, nil)
		return database.PersonalPods{}, reqErr
	}

	vnetName := h.personalPodVNetName(personalPod.NetworkNumber)
	if reqErr := h.ensurePodVNetExists(ctx, vnetName); reqErr != nil {
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, nil)
		return database.PersonalPods{}, reqErr
	}

	reservation, err := h.Service.ReserveFolderVMCapacity(ctx, folderID, 1, "personal_pod_create")
	if err != nil {
		reqErr := inventoryRequestError(err)
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, nil)
		return database.PersonalPods{}, reqErr
	}
	if reservation != nil {
		defer reservation.Release(ctx)
	}

	placement, err := h.Service.ResolveFolderPlacement(ctx, folderID)
	if err != nil {
		reqErr := inventoryRequestError(err)
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, nil)
		return database.PersonalPods{}, reqErr
	}

	targetNode, err := h.resolveCloneTargetNode(ctx)
	if err != nil {
		reqErr := &requestError{
			Status:      http.StatusBadGateway,
			UserMessage: "failed to resolve target node",
			Operation:   "resolve personal pod clone target node",
			Err:         err,
		}
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, nil)
		return database.PersonalPods{}, reqErr
	}

	source, reqErr := h.resolvePublishedPodVMTemplate(ctx, h.PersonalPodRouterTemplateItemID)
	if reqErr != nil {
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, nil)
		return database.PersonalPods{}, reqErr
	}

	created := make(map[int]clonedVM, 1)
	clone, reqErr := h.cloneVerifiedVMIntoFolder(
		ctx,
		source,
		h.PersonalPodRouterTemplateItemID,
		placement,
		targetNode,
		"router",
		false,
		cloneVMOptions{
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
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, created)
		return database.PersonalPods{}, reqErr
	}

	targets := []podNetworkVMTarget{{
		name:   "router",
		clone:  clone,
		router: true,
	}}
	if reqErr := h.waitForPodVMTargetsReady(ctx, targets); reqErr != nil {
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, created)
		return database.PersonalPods{}, reqErr
	}
	if reqErr := h.configurePodVNetBridges(ctx, vnetName, targets); reqErr != nil {
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, created)
		return database.PersonalPods{}, reqErr
	}

	personalCloneConfig := h.RouterCloneConfig
	personalCloneConfig.CloudInitUserFilePattern = h.RouterCloneConfig.PersonalCloudInitUserFilePattern
	cloudInitConfig, err := buildClonedRouterCloudInitConfig(personalPod.NetworkNumber, personalCloneConfig)
	if err != nil {
		reqErr := &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to build router cloud-init configuration",
			Operation:   "build personal router cloud-init configuration",
			Err:         err,
		}
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, created)
		return database.PersonalPods{}, reqErr
	}
	if reqErr := h.configurePodRouterCloudInit(ctx, cloudInitConfig, targets); reqErr != nil {
		recordFailure(reqErr)
		h.cleanupFailedPodProvision(folderID, created)
		return database.PersonalPods{}, reqErr
	}

	if h.Audit != nil {
		h.Audit.RecordSuccess(ctx, audit.EventParams{
			ActorPrincipalID: &userPrincipalID,
			ActionKind:       "personal_pod.create",
			TargetKind:       "folder",
			InventoryItemID:  &folderID,
			Metadata: map[string]any{
				"network_number": personalPod.NetworkNumber,
				"vnet":           vnetName,
			},
		})
	}

	return personalPod, nil
}

func (h *PodsHandler) GetPersonalPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	q := database.New(h.DB)
	row, err := q.GetPersonalPodByUser(c.Request.Context(), principalID)
	var personalPod *personalPodSummaryResponse
	switch {
	case err == nil:
		network, networkErr := h.personalPodNetworkMetadata(row.NetworkNumber)
		if networkErr != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to load personal pod", "build personal pod network metadata", networkErr)
			return
		}
		personalPod = &personalPodSummaryResponse{
			ID:       row.ID,
			FolderID: row.FolderID,
			Network:  network,
		}
	case errors.Is(err, pgx.ErrNoRows):
	default:
		writeLoggedError(c, http.StatusInternalServerError, "failed to load personal pod", "load personal pod by user", err)
		return
	}

	canCreate, err := h.Authz.HasManagement(c.Request.Context(), principalID, authorization.ManagementPermissionManager)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load personal pod", "load management permissions", err)
		return
	}

	var pendingRequestID *uuid.UUID
	requestID, err := q.GetPendingRequestByRequesterAndKind(c.Request.Context(), database.GetPendingRequestByRequesterAndKindParams{
		RequesterPrincipalID: principalID,
		Kind:                 requestqueue.RequestKindPersonalPodCreate,
	})
	switch {
	case err == nil:
		pendingRequestID = &requestID
	case errors.Is(err, pgx.ErrNoRows):
	default:
		writeLoggedError(c, http.StatusInternalServerError, "failed to load personal pod", "load pending personal pod request", err)
		return
	}

	c.JSON(http.StatusOK, personalPodStatusResponse{
		Configured:       h.PersonalPodRouterTemplateItemID != uuid.Nil,
		CanCreate:        canCreate,
		PersonalPod:      personalPod,
		PendingRequestID: pendingRequestID,
	})
}

func (h *PodsHandler) CreatePersonalPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if !requireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	row, reqErr := h.provisionPersonalPod(c.Request.Context(), principalID)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}

	c.JSON(http.StatusOK, personalPodCreateResponse{
		FolderID: row.FolderID,
	})
}

func (h *PodsHandler) PersonalPodsEnabled() bool {
	return h.PersonalPodRouterTemplateItemID != uuid.Nil
}

func (h *PodsHandler) ProvisionPersonalPod(ctx context.Context, userPrincipalID uuid.UUID) error {
	if reqErr := func() *requestError {
		_, reqErr := h.provisionPersonalPod(ctx, userPrincipalID)
		return reqErr
	}(); reqErr != nil {
		return errors.New(reqErr.UserMessage)
	}

	return nil
}
