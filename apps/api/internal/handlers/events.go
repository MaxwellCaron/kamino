package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// eventsAuthz is the narrow authorization seam EventsHandler depends on.
type eventsAuthz interface {
	IsManager(ctx context.Context, principalID uuid.UUID) (bool, error)
	FilterVisibleStatuses(ctx context.Context, principalID uuid.UUID, statuses map[int]string) (map[int]string, error)
}

// eventsRequestService is the narrow request-queue seam EventsHandler depends on.
type eventsRequestService interface {
	EnsureQueueAccess(ctx context.Context, principalID uuid.UUID) error
	Subscribe() (<-chan requestqueue.Event, func())
}

type EventsHandler struct {
	InventoryNotifier *inventory.Notifier
	VMNotifier        *vmstatus.Notifier
	Requests          eventsRequestService
	Authz             eventsAuthz
	Sessions          liveSessionValidator
}

// Stream pushes dashboard-wide server events over a single authenticated SSE
// connection.
func (h *EventsHandler) Stream(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	sessionID, ok := currentSessionID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if h.Sessions == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "events unavailable"})
		return
	}

	if h.InventoryNotifier == nil && h.VMNotifier == nil && h.Requests == nil && publishedPodProgress == nil {
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
		events, unsubscribe := h.Requests.Subscribe()
		defer unsubscribe()
		requestEvents = events
	}

	var publishProgressEvents <-chan publishPodProgressSnapshot
	if h.Authz != nil {
		events, unsubscribe := publishedPodProgress.subscribe()
		defer unsubscribe()
		publishProgressEvents = events
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

	heartbeat := time.NewTicker(liveCheckInterval)
	defer heartbeat.Stop()

	h.streamLoop(c, principalID, sessionID, flusher, inventoryEvents, vmEvents, requestEvents, publishProgressEvents, heartbeat.C)
}

// streamLoop is Stream's event pump, extracted so tests can inject fake channels.
func (h *EventsHandler) streamLoop(
	c *gin.Context,
	principalID uuid.UUID,
	sessionID uuid.UUID,
	flusher http.Flusher,
	inventoryEvents <-chan inventory.Event,
	vmEvents <-chan vmstatus.Event,
	requestEvents <-chan requestqueue.Event,
	publishProgressEvents <-chan publishPodProgressSnapshot,
	heartbeatTick <-chan time.Time,
) {
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case event, ok := <-inventoryEvents:
			if !ok {
				inventoryEvents = nil
				continue
			}
			event.ItemID = nil
			if err := writeSSEvent(c.Writer, event.Type, event); err != nil {
				return
			}
			flusher.Flush()
		case event, ok := <-vmEvents:
			if !ok {
				vmEvents = nil
				continue
			}

			filteredStatuses, err := h.filterVMStatuses(c.Request.Context(), principalID, event.Statuses)
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
			send, err := h.authorizeRequestEvent(c.Request.Context(), principalID, event)
			if err != nil {
				log.Printf("sse request event authorization failed: %v", err)
				return
			}
			if !send {
				continue
			}
			if event.Type == "" {
				event.Type = "request.changed"
			}
			if err := writeSSEvent(c.Writer, event.Type, event); err != nil {
				return
			}
			flusher.Flush()
		case event, ok := <-publishProgressEvents:
			if !ok {
				publishProgressEvents = nil
				continue
			}
			isManager, err := h.authorizePublishProgressEvent(c.Request.Context(), principalID)
			if err != nil {
				log.Printf("sse publish progress authorization failed: %v", err)
				return
			}
			if !isManager {
				continue
			}
			if err := writeSSEvent(c.Writer, publishProgressEventType, event); err != nil {
				return
			}
			flusher.Flush()
		case <-heartbeatTick:
			if err := h.Sessions.ValidateLiveSession(c.Request.Context(), sessionID, principalID); err != nil {
				return
			}
			fmt.Fprint(c.Writer, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

// authorizeRequestEvent reports whether to send event; a non-nil error means close the stream instead of skipping it.
func (h *EventsHandler) authorizeRequestEvent(
	ctx context.Context,
	principalID uuid.UUID,
	event requestqueue.Event,
) (send bool, err error) {
	if event.RequestID == nil || event.RequesterPrincipalID == nil {
		return false, nil
	}
	if *event.RequesterPrincipalID == principalID {
		return true, nil
	}
	if h.Requests == nil {
		return false, nil
	}

	if qErr := h.Requests.EnsureQueueAccess(freshAuthzContext(ctx), principalID); qErr != nil {
		if errors.Is(qErr, requestqueue.ErrRequestForbidden) {
			return false, nil
		}
		return false, qErr
	}
	return true, nil
}

// filterVMStatuses recomputes visible VM statuses with a fresh principal cache each call.
func (h *EventsHandler) filterVMStatuses(
	ctx context.Context,
	principalID uuid.UUID,
	statuses map[int]string,
) (map[int]string, error) {
	return h.Authz.FilterVisibleStatuses(freshAuthzContext(ctx), principalID, statuses)
}

// authorizePublishProgressEvent rechecks Manager status fresh for every progress event.
func (h *EventsHandler) authorizePublishProgressEvent(
	ctx context.Context,
	principalID uuid.UUID,
) (bool, error) {
	return h.Authz.IsManager(freshAuthzContext(ctx), principalID)
}

func writeSSEvent(w http.ResponseWriter, eventType string, event any) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, payload)
	return err
}
