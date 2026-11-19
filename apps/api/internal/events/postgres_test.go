package events

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/jackc/pgx/v5/pgconn"
)

type notificationWriter struct {
	database.DBTX
	query string
	args  []any
	err   error
}

func (w *notificationWriter) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	w.query, w.args = query, args
	return pgconn.CommandTag{}, w.err
}

func TestPostgresNotifyPreservesChannelAndPayload(t *testing.T) {
	type event struct {
		Type  string `json:"type"`
		Value int    `json:"value"`
	}
	notifier := NewPostgres[event](nil, "inventory_events")
	writer := &notificationWriter{}
	want := event{Type: "inventory.changed", Value: 7}
	if err := notifier.Notify(context.Background(), writer, want); err != nil {
		t.Fatal(err)
	}
	if writer.query != "select pg_notify($1, $2)" || writer.args[0] != "inventory_events" {
		t.Fatalf("unexpected notification %s %v", writer.query, writer.args)
	}
	var got event
	if err := json.Unmarshal([]byte(writer.args[1].(string)), &got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	writer.err = errors.New("transaction failed")
	if err := notifier.Notify(context.Background(), writer, want); !errors.Is(err, writer.err) {
		t.Fatalf("lost transaction error: %v", err)
	}
}
