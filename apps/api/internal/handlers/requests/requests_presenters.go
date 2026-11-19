package requests

import (
	"errors"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func writeRequestServiceError(c *gin.Context, err error, operation string) {
	switch {
	case errors.Is(err, requestqueue.ErrRequestNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
	case errors.Is(err, requestqueue.ErrRequestForbidden):
		httpx.WriteForbidden(c)
	case errors.Is(err, requestqueue.ErrRequestDirectExecution):
		httpx.WriteConflict(c, "action is directly allowed and should not be queued")
	case errors.Is(err, requestqueue.ErrRequestNotPending):
		httpx.WriteConflict(c, "request is not pending")
	case errors.Is(err, requestqueue.ErrRequestLimitExceeded):
		httpx.WriteConflict(c, "users may only have 3 pending requests at a time")
	case errors.Is(err, requestqueue.ErrRequestPersonalPodExists):
		httpx.WriteConflict(c, "personal pod already exists")
	case errors.Is(err, requestqueue.ErrRequestDuplicatePending):
		httpx.WriteConflict(c, "a pending personal pod request already exists")
	case errors.Is(err, requestqueue.ErrRequestUnsupportedKind):
		httpx.WriteConflict(c, "personal pods are not configured")
	case errors.Is(err, requestqueue.ErrRequestInvalidPowerAction),
		errors.Is(err, requestqueue.ErrRequestInvalidSnapshot):
		httpx.WriteLoggedError(c, http.StatusUnprocessableEntity, err.Error(), operation, err)
	default:
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "request operation failed", operation, err)
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
			CreatedAt:        httpx.OptionalTime(event.CreatedAt),
		})
	}

	return response
}

func pendingRequestFilteredRowToResponse(row database.ListPendingRequestsFilteredRow) requestSummaryResponse {
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

func completedRequestsForKindsFilteredRowToResponse(row database.ListCompletedRequestsForKindsFilteredRow) requestSummaryResponse {
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

func requesterPendingRequestFilteredRowToResponse(
	row database.ListPendingRequestsByRequesterFilteredRow,
) requestSummaryResponse {
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

func requesterHistoryFilteredRowToResponse(
	row database.ListRequestHistoryByRequesterFilteredRow,
) requestSummaryResponse {
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
		ReviewedAt:           httpx.OptionalTime(reviewedAt),
		ExecutedAt:           httpx.OptionalTime(executedAt),
		CanceledAt:           httpx.OptionalTime(canceledAt),
		ExecutionError:       executionError,
		CreatedAt:            httpx.OptionalTime(createdAt),
		UpdatedAt:            httpx.OptionalTime(updatedAt),
		Inventory:            inventoryPayload,
	}
}

func optionalRequestStatus(value database.NullRequestStatus) *string {
	if !value.Valid {
		return nil
	}

	return new(string(value.RequestStatus))
}

func optionalActorUsername(actorPrincipalID *uuid.UUID, username string) *string {
	if actorPrincipalID == nil {
		return nil
	}

	return &username
}
