package requests

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

const requestsEventsChannel = "requests_events"

type Event struct {
	Type                 string     `json:"type"`
	RequestID            *uuid.UUID `json:"request_id,omitempty"`
	RequesterPrincipalID *uuid.UUID `json:"requester_principal_id,omitempty"`
	Kind                 string     `json:"kind,omitempty"`
	Timestamp            time.Time  `json:"timestamp"`
}

type Notifier struct {
	db *pgxpool.Pool

	mu          sync.RWMutex
	subscribers map[chan Event]struct{}
}

func NewNotifier(db *pgxpool.Pool) *Notifier {
	return &Notifier{
		db:          db,
		subscribers: make(map[chan Event]struct{}),
	}
}

func (n *Notifier) Start(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}

		if err := n.listenOnce(ctx); err != nil && ctx.Err() == nil {
			log.Printf("requests notifier error: %v", err)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(3 * time.Second):
		}
	}
}

func (n *Notifier) listenOnce(ctx context.Context) error {
	conn, err := n.db.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "listen "+requestsEventsChannel); err != nil {
		return err
	}

	for {
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return err
		}

		var event Event
		if err := json.Unmarshal([]byte(notification.Payload), &event); err != nil {
			log.Printf("requests notifier payload decode failed: %v", err)
			continue
		}

		n.broadcast(event)
	}
}

func (n *Notifier) Subscribe() (<-chan Event, func()) {
	ch := make(chan Event, 16)

	n.mu.Lock()
	n.subscribers[ch] = struct{}{}
	n.mu.Unlock()

	return ch, func() {
		n.mu.Lock()
		if _, ok := n.subscribers[ch]; ok {
			delete(n.subscribers, ch)
			close(ch)
		}
		n.mu.Unlock()
	}
}

func (n *Notifier) Notify(ctx context.Context, exec database.DBTX, event Event) error {
	if event.Type == "" {
		event.Type = "request.changed"
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now().UTC()
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = exec.Exec(ctx, "select pg_notify($1, $2)", requestsEventsChannel, string(payload))
	return err
}

func (n *Notifier) broadcast(event Event) {
	n.mu.RLock()
	defer n.mu.RUnlock()

	for ch := range n.subscribers {
		select {
		case ch <- event:
		default:
		}
	}
}
