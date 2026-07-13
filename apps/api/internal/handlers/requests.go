package handlers

import (
	"net/http"
	"strings"
	"time"

	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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

type tableRequestResponse struct {
	Items []requestSummaryResponse `json:"items"`
	Total int32                    `json:"total"`
	Page  int32                    `json:"page"`
	Rows  int32                    `json:"rows"`
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
		writeUnauthorized(c)
		return
	}

	scope := strings.TrimSpace(c.Query("scope"))
	if scope == "" {
		scope = "pending"
	}

	page, rows, ok := parseTableParams(c)
	if !ok {
		return
	}
	search := strings.TrimSpace(c.Query("search"))
	tableParams := requestqueue.TablePageParams{Page: page, Rows: rows, Search: search}

	switch scope {
	case "pending":
		result, err := h.Service.ListPendingRequestsTable(c.Request.Context(), principalID, tableParams)
		if err != nil {
			writeRequestServiceError(c, err, "list pending requests")
			return
		}

		response := make([]requestSummaryResponse, 0, len(result.Items))
		for _, row := range result.Items {
			response = append(response, pendingRequestFilteredRowToResponse(row))
		}
		c.JSON(http.StatusOK, tableRequestResponse{
			Items: response,
			Total: result.Total,
			Page:  result.Page,
			Rows:  result.Rows,
		})
	case "completed", "history":
		result, err := h.Service.ListCompletedRequestsTable(c.Request.Context(), principalID, tableParams)
		if err != nil {
			writeRequestServiceError(c, err, "list completed requests")
			return
		}

		response := make([]requestSummaryResponse, 0, len(result.Items))
		for _, row := range result.Items {
			response = append(response, completedRequestsForKindsFilteredRowToResponse(row))
		}

		c.JSON(http.StatusOK, tableRequestResponse{
			Items: response,
			Total: result.Total,
			Page:  result.Page,
			Rows:  result.Rows,
		})
	default:
		writeInvalidRequest(c, "invalid scope")
	}
}

func (h *RequestsHandler) ListMine(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	scope := strings.TrimSpace(c.Query("scope"))
	if scope == "" {
		scope = "history"
	}

	page, rows, ok := parseTableParams(c)
	if !ok {
		return
	}
	search := strings.TrimSpace(c.Query("search"))
	tableParams := requestqueue.TablePageParams{Page: page, Rows: rows, Search: search}

	switch scope {
	case "pending":
		result, err := h.Service.ListPendingRequestsByRequesterTable(c.Request.Context(), principalID, tableParams)
		if err != nil {
			writeRequestServiceError(c, err, "list own pending requests")
			return
		}

		response := make([]requestSummaryResponse, 0, len(result.Items))
		for _, row := range result.Items {
			response = append(response, requesterPendingRequestFilteredRowToResponse(row))
		}
		c.JSON(http.StatusOK, tableRequestResponse{
			Items: response,
			Total: result.Total,
			Page:  result.Page,
			Rows:  result.Rows,
		})
	case "completed", "history":
		result, err := h.Service.ListRequestHistoryByRequesterTable(c.Request.Context(), principalID, tableParams)
		if err != nil {
			writeRequestServiceError(c, err, "list own request history")
			return
		}

		response := make([]requestSummaryResponse, 0, len(result.Items))
		for _, row := range result.Items {
			response = append(response, requesterHistoryFilteredRowToResponse(row))
		}

		c.JSON(http.StatusOK, tableRequestResponse{
			Items: response,
			Total: result.Total,
			Page:  result.Page,
			Rows:  result.Rows,
		})
	default:
		writeInvalidRequest(c, "invalid scope")
	}
}

// parseTableParams parses the shared page/rows query contract used by
// request table endpoints. On invalid input it writes a 400 response and
// returns ok=false.
func parseTableParams(c *gin.Context) (page int32, rows int32, ok bool) {
	page, ok = parsePageParam(c.Query("page"))
	if !ok {
		writeInvalidRequest(c, "invalid page")
		return 0, 0, false
	}

	rows, ok = parseRowsParam(c.Query("rows"))
	if !ok {
		writeInvalidRequest(c, "invalid rows")
		return 0, 0, false
	}

	return page, rows, true
}

func (h *RequestsHandler) Get(c *gin.Context) {
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
