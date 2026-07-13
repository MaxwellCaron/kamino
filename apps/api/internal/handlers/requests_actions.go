package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *RequestsHandler) Approve(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
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
		writeUnauthorized(c)
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
			} else if errors.Is(err, requestqueue.ErrRequestActionInProgress) {
				errorMessage = "another action is already in progress for this VM"
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
		writeUnauthorized(c)
		return
	}

	requestID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeInvalidRequest(c, "invalid id")
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
