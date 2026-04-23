package handlers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type RequestsHandler struct {
	Service *requestqueue.Service
}

type requestActionRequest struct {
	IDs []string `json:"ids" binding:"required"`
}

type requestActionFailure struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

type requestActionResponse struct {
	Processed []string               `json:"processed"`
	Failed    []requestActionFailure `json:"failed"`
}

type submitPowerRequest struct {
	Action string `json:"action" binding:"required,oneof=start shutdown reboot stop"`
}

type submitRollbackSnapshotRequest struct {
	Snapname string `json:"snapname" binding:"required"`
}

type submitCreateSnapshotRequest struct {
	Snapname string `json:"snapname" binding:"required"`
}

type requestSummaryResponse struct {
	ID                   uuid.UUID                `json:"id"`
	Family               string                   `json:"family"`
	Kind                 string                   `json:"kind"`
	Status               string                   `json:"status"`
	RequesterPrincipalID uuid.UUID                `json:"requester_principal_id"`
	RequesterUsername    string                   `json:"requester_username"`
	ReviewerPrincipalID  *uuid.UUID               `json:"reviewer_principal_id,omitempty"`
	ReviewerUsername     *string                  `json:"reviewer_username,omitempty"`
	ReviewedAt           *time.Time               `json:"reviewed_at,omitempty"`
	ExecutedAt           *time.Time               `json:"executed_at,omitempty"`
	CanceledAt           *time.Time               `json:"canceled_at,omitempty"`
	ExecutionError       *string                  `json:"execution_error,omitempty"`
	CreatedAt            *time.Time               `json:"created_at,omitempty"`
	UpdatedAt            *time.Time               `json:"updated_at,omitempty"`
	Inventory            *requestInventoryPayload `json:"inventory,omitempty"`
}

type requestDetailResponse struct {
	requestSummaryResponse
	Events []requestEventResponse `json:"events"`
}

type requestInventoryPayload struct {
	ItemID       *uuid.UUID `json:"item_id,omitempty"`
	ItemName     *string    `json:"item_name,omitempty"`
	ItemKind     *string    `json:"item_kind,omitempty"`
	ItemParentID *uuid.UUID `json:"item_parent_id,omitempty"`
	VMNode       *string    `json:"vm_node,omitempty"`
	VMID         *int32     `json:"vmid,omitempty"`
	IsTemplate   *bool      `json:"is_template,omitempty"`
	PowerAction  *string    `json:"power_action,omitempty"`
	SnapshotName *string    `json:"snapshot_name,omitempty"`
}

type requestEventResponse struct {
	ID               int64      `json:"id"`
	EventKind        string     `json:"event_kind"`
	ActorPrincipalID *uuid.UUID `json:"actor_principal_id,omitempty"`
	ActorUsername    *string    `json:"actor_username,omitempty"`
	FromStatus       *string    `json:"from_status,omitempty"`
	ToStatus         string     `json:"to_status"`
	ErrorMessage     *string    `json:"error_message,omitempty"`
	CreatedAt        *time.Time `json:"created_at,omitempty"`
}

func (h *RequestsHandler) List(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	scope := strings.TrimSpace(c.Query("scope"))
	if scope == "" {
		scope = "pending"
	}

	switch scope {
	case "pending":
		rows, err := h.Service.ListPendingRequests(c.Request.Context(), principalID)
		if err != nil {
			writeRequestServiceError(c, err, "list pending requests")
			return
		}

		response := make([]requestSummaryResponse, 0, len(rows))
		for _, row := range rows {
			response = append(response, pendingRequestRowToResponse(row))
		}
		c.JSON(http.StatusOK, response)
	case "completed", "history":
		rows, err := h.Service.ListCompletedRequests(c.Request.Context(), principalID)
		if err != nil {
			writeRequestServiceError(c, err, "list completed requests")
			return
		}

		response := make([]requestSummaryResponse, 0, len(rows))
		for _, row := range rows {
			response = append(response, completedRequestRowToResponse(row))
		}
		c.JSON(http.StatusOK, response)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid scope"})
	}
}

func (h *RequestsHandler) Get(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	requestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	row, events, err := h.Service.GetRequest(c.Request.Context(), principalID, requestID)
	if err != nil {
		writeRequestServiceError(c, err, "get request")
		return
	}

	c.JSON(http.StatusOK, requestDetailResponse{
		requestSummaryResponse: requestDetailRowToResponse(row),
		Events:                 requestEventsToResponse(events),
	})
}

func (h *RequestsHandler) Approve(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req requestActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	h.writeRequestActionResponse(c, principalID, req.IDs, h.Service.ApproveRequest)
}

func (h *RequestsHandler) Deny(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req requestActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	h.writeRequestActionResponse(c, principalID, req.IDs, h.Service.DenyRequest)
}

func (h *RequestsHandler) writeRequestActionResponse(
	c *gin.Context,
	reviewerID uuid.UUID,
	rawIDs []string,
	actionFn func(context.Context, uuid.UUID, uuid.UUID) (database.GetRequestByIDRow, []database.ListRequestEventsByRequestIDRow, error),
) {
	response := requestActionResponse{
		Processed: make([]string, 0, len(rawIDs)),
		Failed:    make([]requestActionFailure, 0),
	}

	for _, rawID := range rawIDs {
		requestID, err := uuid.Parse(rawID)
		if err != nil {
			response.Failed = append(response.Failed, requestActionFailure{
				ID:    rawID,
				Error: "invalid id",
			})
			continue
		}

		_, _, err = actionFn(c.Request.Context(), reviewerID, requestID)
		if err != nil {
			logRequestError(c, "request action failed id="+rawID, err)
			errorMessage := "action failed"
			if errors.Is(err, requestqueue.ErrRequestNotFound) {
				errorMessage = "request not found"
			} else if errors.Is(err, requestqueue.ErrRequestNotPending) {
				errorMessage = "request is not pending"
			} else if errors.Is(err, requestqueue.ErrRequestForbidden) {
				errorMessage = "forbidden"
			}
			response.Failed = append(response.Failed, requestActionFailure{
				ID:    rawID,
				Error: errorMessage,
			})
			continue
		}

		response.Processed = append(response.Processed, rawID)
	}

	c.JSON(http.StatusOK, response)
}

func (h *RequestsHandler) Cancel(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	requestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	row, events, err := h.Service.CancelRequest(c.Request.Context(), principalID, requestID)
	if err != nil {
		writeRequestServiceError(c, err, "cancel request")
		return
	}

	c.JSON(http.StatusOK, requestDetailResponse{
		requestSummaryResponse: requestDetailRowToResponse(row),
		Events:                 requestEventsToResponse(events),
	})
}

func (h *RequestsHandler) SubmitInventoryPower(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}

	var req submitPowerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	action, err := inventoryPowerActionFromRequest(req.Action)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row, err := h.Service.SubmitInventoryPowerRequest(c.Request.Context(), principalID, itemID, action)
	if err != nil {
		writeRequestServiceError(c, err, "submit inventory power request")
		return
	}

	c.JSON(http.StatusCreated, requestDetailResponse{
		requestSummaryResponse: requestDetailRowToResponse(row),
		Events:                 []requestEventResponse{},
	})
}

func (h *RequestsHandler) SubmitInventoryDelete(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}

	row, err := h.Service.SubmitInventoryDeleteRequest(c.Request.Context(), principalID, itemID)
	if err != nil {
		writeRequestServiceError(c, err, "submit inventory delete request")
		return
	}

	c.JSON(http.StatusCreated, requestDetailResponse{
		requestSummaryResponse: requestDetailRowToResponse(row),
		Events:                 []requestEventResponse{},
	})
}

func (h *RequestsHandler) SubmitInventorySnapshotCreate(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}

	var req submitCreateSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	row, err := h.Service.SubmitInventorySnapshotCreateRequest(
		c.Request.Context(),
		principalID,
		itemID,
		req.Snapname,
	)
	if err != nil {
		writeRequestServiceError(c, err, "submit inventory snapshot create request")
		return
	}

	c.JSON(http.StatusCreated, requestDetailResponse{
		requestSummaryResponse: requestDetailRowToResponse(row),
		Events:                 []requestEventResponse{},
	})
}

func (h *RequestsHandler) SubmitInventorySnapshotRollback(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}

	var req submitRollbackSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	row, err := h.Service.SubmitInventorySnapshotRollbackRequest(
		c.Request.Context(),
		principalID,
		itemID,
		req.Snapname,
	)
	if err != nil {
		writeRequestServiceError(c, err, "submit inventory snapshot rollback request")
		return
	}

	c.JSON(http.StatusCreated, requestDetailResponse{
		requestSummaryResponse: requestDetailRowToResponse(row),
		Events:                 []requestEventResponse{},
	})
}

func writeRequestServiceError(c *gin.Context, err error, operation string) {
	switch {
	case errors.Is(err, requestqueue.ErrRequestNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
	case errors.Is(err, requestqueue.ErrRequestForbidden):
		writeForbidden(c)
	case errors.Is(err, requestqueue.ErrRequestDirectExecution):
		c.JSON(http.StatusConflict, gin.H{"error": "action is directly allowed and should not be queued"})
	case errors.Is(err, requestqueue.ErrRequestNotPending):
		c.JSON(http.StatusConflict, gin.H{"error": "request is not pending"})
	case errors.Is(err, requestqueue.ErrRequestInvalidPowerAction),
		errors.Is(err, requestqueue.ErrRequestInvalidSnapshot):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
	default:
		writeLoggedError(c, http.StatusInternalServerError, "request operation failed", operation, err)
	}
}

func inventoryPowerActionFromRequest(action string) (database.InventoryRequestPowerAction, error) {
	switch strings.TrimSpace(action) {
	case "start":
		return database.InventoryRequestPowerActionPowerOn, nil
	case "shutdown":
		return database.InventoryRequestPowerActionShutdown, nil
	case "reboot":
		return database.InventoryRequestPowerActionReboot, nil
	case "stop":
		return database.InventoryRequestPowerActionStop, nil
	default:
		return "", requestqueue.ErrRequestInvalidPowerAction
	}
}

func requestEventsToResponse(events []database.ListRequestEventsByRequestIDRow) []requestEventResponse {
	response := make([]requestEventResponse, 0, len(events))
	for _, event := range events {
		response = append(response, requestEventResponse{
			ID:               event.ID,
			EventKind:        string(event.EventKind),
			ActorPrincipalID: event.ActorPrincipalID,
			ActorUsername:    optionalActorUsername(event.ActorPrincipalID, event.ActorUsername),
			FromStatus:       optionalRequestStatus(event.FromStatus),
			ToStatus:         string(event.ToStatus),
			ErrorMessage:     event.ErrorMessage,
			CreatedAt:        optionalTime(event.CreatedAt),
		})
	}

	return response
}

func pendingRequestRowToResponse(row database.ListPendingRequestsRow) requestSummaryResponse {
	return buildRequestSummaryResponse(
		row.ID,
		string(row.Family),
		row.Kind,
		string(row.Status),
		row.RequesterPrincipalID,
		row.RequesterUsername,
		row.ReviewerPrincipalID,
		row.ReviewerUsername,
		row.ReviewedAt,
		row.ExecutedAt,
		row.CanceledAt,
		row.ExecutionError,
		row.CreatedAt,
		row.UpdatedAt,
		row.InventoryItemID,
		row.InventoryItemName,
		row.InventoryItemKind,
		row.InventoryItemParentID,
		row.InventoryVmNode,
		row.InventoryVmVmid,
		row.InventoryVmIsTemplate,
		row.PowerAction,
		row.SnapshotName,
	)
}

func completedRequestRowToResponse(row database.ListCompletedRequestsRow) requestSummaryResponse {
	return buildRequestSummaryResponse(
		row.ID,
		string(row.Family),
		row.Kind,
		string(row.Status),
		row.RequesterPrincipalID,
		row.RequesterUsername,
		row.ReviewerPrincipalID,
		row.ReviewerUsername,
		row.ReviewedAt,
		row.ExecutedAt,
		row.CanceledAt,
		row.ExecutionError,
		row.CreatedAt,
		row.UpdatedAt,
		row.InventoryItemID,
		row.InventoryItemName,
		row.InventoryItemKind,
		row.InventoryItemParentID,
		row.InventoryVmNode,
		row.InventoryVmVmid,
		row.InventoryVmIsTemplate,
		row.PowerAction,
		row.SnapshotName,
	)
}

func requestDetailRowToResponse(row database.GetRequestByIDRow) requestSummaryResponse {
	return buildRequestSummaryResponse(
		row.ID,
		string(row.Family),
		row.Kind,
		string(row.Status),
		row.RequesterPrincipalID,
		row.RequesterUsername,
		row.ReviewerPrincipalID,
		row.ReviewerUsername,
		row.ReviewedAt,
		row.ExecutedAt,
		row.CanceledAt,
		row.ExecutionError,
		row.CreatedAt,
		row.UpdatedAt,
		row.InventoryItemID,
		row.InventoryItemName,
		row.InventoryItemKind,
		row.InventoryItemParentID,
		row.InventoryVmNode,
		row.InventoryVmVmid,
		row.InventoryVmIsTemplate,
		row.PowerAction,
		row.SnapshotName,
	)
}

func buildRequestSummaryResponse(
	id uuid.UUID,
	family string,
	kind string,
	status string,
	requesterPrincipalID uuid.UUID,
	requesterUsername string,
	reviewerPrincipalID *uuid.UUID,
	reviewerUsername string,
	reviewedAt pgtype.Timestamptz,
	executedAt pgtype.Timestamptz,
	canceledAt pgtype.Timestamptz,
	executionError *string,
	createdAt pgtype.Timestamptz,
	updatedAt pgtype.Timestamptz,
	inventoryItemID *uuid.UUID,
	inventoryItemName *string,
	inventoryItemKind database.NullInventoryItemKind,
	inventoryItemParentID *uuid.UUID,
	inventoryVmNode *string,
	inventoryVmVmid *int32,
	inventoryVmIsTemplate *bool,
	powerAction database.NullInventoryRequestPowerAction,
	snapshotName *string,
) requestSummaryResponse {
	var itemKind *string
	if inventoryItemKind.Valid {
		value := string(inventoryItemKind.InventoryItemKind)
		itemKind = &value
	}

	var powerActionValue *string
	if powerAction.Valid {
		value := string(powerAction.InventoryRequestPowerAction)
		powerActionValue = &value
	}

	var reviewerUsernameValue *string
	if reviewerPrincipalID != nil {
		reviewerUsernameValue = &reviewerUsername
	}

	inventoryPayload := (*requestInventoryPayload)(nil)
	if inventoryItemID != nil || snapshotName != nil || powerActionValue != nil {
		inventoryPayload = &requestInventoryPayload{
			ItemID:       inventoryItemID,
			ItemName:     inventoryItemName,
			ItemKind:     itemKind,
			ItemParentID: inventoryItemParentID,
			VMNode:       inventoryVmNode,
			VMID:         inventoryVmVmid,
			IsTemplate:   inventoryVmIsTemplate,
			PowerAction:  powerActionValue,
			SnapshotName: snapshotName,
		}
	}

	return requestSummaryResponse{
		ID:                   id,
		Family:               family,
		Kind:                 kind,
		Status:               status,
		RequesterPrincipalID: requesterPrincipalID,
		RequesterUsername:    requesterUsername,
		ReviewerPrincipalID:  reviewerPrincipalID,
		ReviewerUsername:     reviewerUsernameValue,
		ReviewedAt:           optionalTime(reviewedAt),
		ExecutedAt:           optionalTime(executedAt),
		CanceledAt:           optionalTime(canceledAt),
		ExecutionError:       executionError,
		CreatedAt:            optionalTime(createdAt),
		UpdatedAt:            optionalTime(updatedAt),
		Inventory:            inventoryPayload,
	}
}

func optionalTime(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}

	timestamp := value.Time
	return &timestamp
}

func optionalRequestStatus(value database.NullRequestStatus) *string {
	if !value.Valid {
		return nil
	}

	status := string(value.RequestStatus)
	return &status
}

func optionalActorUsername(actorPrincipalID *uuid.UUID, username string) *string {
	if actorPrincipalID == nil {
		return nil
	}

	return &username
}
