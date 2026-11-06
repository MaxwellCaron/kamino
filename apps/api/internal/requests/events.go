package requests

import (
	"context"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/events"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Event struct {
	Type                 string     `json:"type"`
	RequestID            *uuid.UUID `json:"request_id,omitempty"`
	RequesterPrincipalID *uuid.UUID `json:"requester_principal_id,omitempty"`
	Kind                 string     `json:"kind,omitempty"`
	Timestamp            time.Time  `json:"timestamp"`
}

type Notifier struct {
	transport *events.Postgres[Event]
}

func NewNotifier(db *pgxpool.Pool) *Notifier {
	return &Notifier{transport: events.NewPostgres[Event](db, "requests_events")}
}

func (n *Notifier) Notify(ctx context.Context, exec database.DBTX, event Event) error {
	if event.Type == "" {
		event.Type = "request.changed"
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now().UTC()
	}
	return n.transport.Notify(ctx, exec, event)
}

func (n *Notifier) Start(ctx context.Context) { n.transport.Start(ctx) }

func (n *Notifier) Subscribe() (<-chan Event, func()) { return n.transport.Subscribe() }
