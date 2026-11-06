package events

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres[T any] struct {
	Broadcaster[T]
	db      *pgxpool.Pool
	channel string
}

func NewPostgres[T any](db *pgxpool.Pool, channel string) *Postgres[T] {
	return &Postgres[T]{db: db, channel: channel}
}

func (n *Postgres[T]) Start(ctx context.Context) {
	for ctx.Err() == nil {
		if err := n.listenOnce(ctx); err != nil && ctx.Err() == nil {
			log.Printf("%s notifier error: %v", n.channel, err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(3 * time.Second):
		}
	}
}

func (n *Postgres[T]) listenOnce(ctx context.Context) error {
	conn, err := n.db.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "listen "+pgx.Identifier{n.channel}.Sanitize()); err != nil {
		return err
	}
	for {
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return err
		}
		var event T
		if err := json.Unmarshal([]byte(notification.Payload), &event); err != nil {
			log.Printf("%s notifier payload decode failed: %v", n.channel, err)
			continue
		}
		n.Broadcast(event)
	}
}

func (n *Postgres[T]) Notify(ctx context.Context, exec database.DBTX, event T) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	_, err = exec.Exec(ctx, "select pg_notify($1, $2)", n.channel, string(payload))
	return err
}
