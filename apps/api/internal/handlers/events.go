package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/gin-gonic/gin"
)

type EventsHandler struct {
	InventoryNotifier *inventory.Notifier
	VMNotifier        *vmstatus.Notifier
	Requests          *requestqueue.Service
	Authz             *authorization.Service
}

// Stream pushes dashboard-wide server events over a single authenticated SSE
// connection.
func (h *EventsHandler) Stream(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	if h.InventoryNotifier == nil && h.VMNotifier == nil && h.Requests == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "events unavailable"})
		return
	}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming unsupported"})
		return
	}

	var inventoryEvents <-chan inventory.Event
	if h.InventoryNotifier != nil {
		events, unsubscribe := h.InventoryNotifier.Subscribe()
		defer unsubscribe()
		inventoryEvents = events
	}

	var vmEvents <-chan vmstatus.Event
	var initialVMEvent *vmstatus.Event
	if h.VMNotifier != nil {
		events, unsubscribe := h.VMNotifier.Subscribe()
		defer unsubscribe()
		vmEvents = events

		if h.Authz == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "authorization unavailable"})
			return
		}

		initialStatuses, err := h.Authz.FilterVisibleStatuses(
			c.Request.Context(),
			principalID,
			h.VMNotifier.Current(),
		)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to authorize VM statuses", "filter initial vm status event", err)
			return
		}

		initialVMEvent = &vmstatus.Event{
			Type:      "vm.statuses.changed",
			Statuses:  initialStatuses,
			Timestamp: time.Now().UTC(),
		}
	}

	var requestEvents <-chan requestqueue.Event
	if h.Requests != nil {
		if err := h.Requests.EnsureQueueAccess(c.Request.Context(), principalID); err != nil {
			if !errors.Is(err, requestqueue.ErrRequestForbidden) {
				writeRequestServiceError(c, err, "authorize request event stream")
				return
			}
		} else {
			events, unsubscribe := h.Requests.Subscribe()
			defer unsubscribe()
			requestEvents = events
		}
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	fmt.Fprint(c.Writer, ": dashboard stream connected\n\n")
	if initialVMEvent != nil {
		if err := writeSSEvent(c.Writer, initialVMEvent.Type, initialVMEvent); err != nil {
			return
		}
	}
	flusher.Flush()

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case event, ok := <-inventoryEvents:
			if !ok {
				inventoryEvents = nil
				continue
			}
			if err := writeSSEvent(c.Writer, event.Type, event); err != nil {
				return
			}
			flusher.Flush()
		case event, ok := <-vmEvents:
			if !ok {
				vmEvents = nil
				continue
			}

			filteredStatuses, err := h.Authz.FilterVisibleStatuses(c.Request.Context(), principalID, event.Statuses)
			if err != nil {
				return
			}

			payload := vmstatus.Event{
				Type:      event.Type,
				Statuses:  filteredStatuses,
				Timestamp: event.Timestamp,
			}
			if err := writeSSEvent(c.Writer, payload.Type, payload); err != nil {
				return
			}
			flusher.Flush()
		case event, ok := <-requestEvents:
			if !ok {
				requestEvents = nil
				continue
			}
			if event.Type == "" {
				event.Type = "request.changed"
			}
			if err := writeSSEvent(c.Writer, event.Type, event); err != nil {
				return
			}
			flusher.Flush()
		case <-heartbeat.C:
			fmt.Fprint(c.Writer, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

func writeSSEvent(w http.ResponseWriter, eventType string, event any) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, payload)
	return err
}
