package pods

import (
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/personalpods"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
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

// requestErrorFromPersonalPodsError maps a typed application error to the handler's existing status/body.
func requestErrorFromPersonalPodsError(err *personalpods.Error) *httpx.RequestError {
	status := http.StatusInternalServerError
	switch err.Kind {
	case personalpods.KindDisabled, personalpods.KindConflict:
		status = http.StatusConflict
	case personalpods.KindNotFound:
		status = http.StatusNotFound
	case personalpods.KindValidation:
		status = http.StatusUnprocessableEntity
	case personalpods.KindUpstream:
		status = http.StatusBadGateway
	}

	return &httpx.RequestError{
		Status:      status,
		UserMessage: err.UserMessage,
		Operation:   err.Operation,
		Err:         err.Err,
	}
}

func personalPodCreateResult(folderID uuid.UUID, err error) (*httpx.RequestError, personalPodCreateResponse) {
	if err != nil {
		var appErr *personalpods.Error
		if !errors.As(err, &appErr) {
			return &httpx.RequestError{
				Status:      http.StatusInternalServerError,
				UserMessage: "failed to create personal pod",
				Operation:   "provision personal pod",
				Err:         err,
			}, personalPodCreateResponse{}
		}
		return requestErrorFromPersonalPodsError(appErr), personalPodCreateResponse{}
	}
	return nil, personalPodCreateResponse{FolderID: folderID}
}

func (h *PodsHandler) personalPodNetworkMetadata(
	target podCloneTarget,
	networkNumber int32,
) (clonedPodNetworkResponse, error) {
	return h.buildPodNetworkMetadata(target, podnetwork.ProfileLANRouterV1, networkNumber)
}

func (h *PodsHandler) GetPersonalPod(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}

	q := database.New(h.DB)
	row, err := q.GetPersonalPodByUser(c.Request.Context(), principalID)
	var personalPod *personalPodSummaryResponse
	switch {
	case err == nil:
		target, reqErr := h.resolvePodCloneTarget(c.Request.Context(), row.CloneTargetKey)
		if reqErr != nil {
			httpx.WriteRequestError(c, reqErr)
			return
		}
		network, networkErr := h.personalPodNetworkMetadata(target, row.NetworkNumber)
		if networkErr != nil {
			httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load personal pod", "build personal pod network metadata", networkErr)
			return
		}
		personalPod = &personalPodSummaryResponse{
			ID:       row.ID,
			FolderID: row.FolderID,
			Network:  network,
		}
	case errors.Is(err, pgx.ErrNoRows):
	default:
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load personal pod", "load personal pod by user", err)
		return
	}

	canCreate, err := h.Authz.IsManager(c.Request.Context(), principalID)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load personal pod", "load management permissions", err)
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
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load personal pod", "load pending personal pod request", err)
		return
	}

	c.JSON(http.StatusOK, personalPodStatusResponse{
		Configured:       h.PersonalPods.PersonalPodsEnabled(),
		CanCreate:        canCreate,
		PersonalPod:      personalPod,
		PendingRequestID: pendingRequestID,
	})
}

func (h *PodsHandler) CreatePersonalPod(c *gin.Context) {
	principalID, ok := httpx.CurrentPrincipalID(c)
	if !ok {
		httpx.WriteUnauthorized(c)
		return
	}
	if !httpx.RequireManagementPermission(c, h.Authz, principalID, authorization.ManagementPermissionManager) {
		return
	}

	folderID, err := h.PersonalPods.ProvisionPersonalPod(c.Request.Context(), principalID)
	reqErr, response := personalPodCreateResult(folderID, err)
	if reqErr != nil {
		httpx.WriteRequestError(c, reqErr)
		return
	}

	c.JSON(http.StatusOK, response)
}
