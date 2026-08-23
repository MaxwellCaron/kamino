package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *RequestsHandler) SubmitInventoryPower(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
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
		writeLoggedError(c, http.StatusBadRequest, err.Error(), "parse inventory power action", err)
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

func (h *RequestsHandler) SubmitInventorySnapshotCreate(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
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
		writeUnauthorized(c)
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

func (h *RequestsHandler) SubmitPersonalPod(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	row, err := h.Service.SubmitPersonalPodRequest(c.Request.Context(), principalID)
	if err != nil {
		writeRequestServiceError(c, err, "submit personal pod request")
		return
	}

	c.JSON(http.StatusCreated, requestDetailResponse{
		requestSummaryResponse: requestDetailRowToResponse(row),
		Events:                 []requestEventResponse{},
	})
}
