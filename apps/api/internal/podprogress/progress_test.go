package podprogress

import (
	"testing"
	"testing/synctest"
	"time"
)

func TestPodProgressWorkflowStates(t *testing.T) {
	tests := []struct {
		name, eventType, batchID   string
		initial, last, wantSuccess int
		newReporter                func(*Tracker) *Reporter
	}{
		{"publish", PublishEventType, "", PublishStepValidating, PublishStepCloning, PublishStepSaving, func(p *Tracker) *Reporter { return p.PublishReporter(" operation ") }},
		{"create", CreateEventType, "", CreateStepValidating, CreateStepConfiguring, CreateStepConfiguring, func(p *Tracker) *Reporter { return p.CreateReporter(" operation ") }},
		{"clone", CloneEventType, "batch", CloneStepFetching, CloneStepCloning, CloneStepRouter, func(p *Tracker) *Reporter { return p.CloneReporter(" operation ", " batch ") }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reporter := tt.newReporter(&Tracker{})
			store := reporter.store
			reporter.Fail("invalid")
			initial, ok := store.get("operation")
			if !ok || initial.StepID != tt.initial || initial.State != podProgressStateError {
				t.Fatalf("initial failure = %+v, found %v", initial, ok)
			}
			reporter.Set(tt.last, "working")
			reporter.Fail("failed")
			failed, _ := store.get("operation")
			if failed.StepID != tt.last || failed.State != podProgressStateError {
				t.Fatalf("failure must retain last step: %+v", failed)
			}
			reporter.Succeed("done")
			snapshot, _ := store.get("operation")
			if snapshot.Type != tt.eventType || snapshot.BatchID != tt.batchID || snapshot.StepID != tt.wantSuccess || snapshot.State != podProgressStateSuccess || snapshot.Message != "done" || snapshot.UpdatedAt.IsZero() {
				t.Fatalf("terminal snapshot = %+v", snapshot)
			}
		})
	}
}

func TestPodProgressExpiryCannotRemoveNewRun(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		var progress Tracker
		reporter := progress.CloneReporter("operation", "")
		reporter.Succeed("old run")
		time.Sleep(30 * time.Second)
		reporter.Set(1, "new run")
		time.Sleep(30 * time.Second)
		synctest.Wait()
		if current, ok := progress.clone.get("operation"); !ok || current.Message != "new run" {
			t.Fatalf("old expiration removed new run: %+v, found %v", current, ok)
		}
		reporter.Succeed("new run done")
		time.Sleep(60 * time.Second)
		synctest.Wait()
		if _, ok := progress.clone.get("operation"); ok {
			t.Fatal("current terminal progress was not expired")
		}
	})
}

func TestPodProgressBatchAndEvents(t *testing.T) {
	var store podProgressStore
	updates, unsubscribe := store.events.Subscribe()
	defer unsubscribe()
	for _, id := range []string{"b", "a"} {
		store.reporter(id, "batch", CloneEventType, 1, 4).Set(2, "cloning")
		select {
		case update := <-updates:
			if update.ID != id || update.Type != CloneEventType {
				t.Fatalf("unexpected event: %+v", update)
			}
		case <-time.After(time.Second):
			t.Fatal("progress update was not broadcast")
		}
	}
	batch := store.getBatch(" batch ")
	if len(batch) != 2 || batch[0].ID != "a" || batch[1].ID != "b" {
		t.Fatalf("batch = %+v", batch)
	}
	if len(store.getBatch("")) != 0 {
		t.Fatal("empty batch matched unbatched operations")
	}
	none := store.reporter(" ", "", CloneEventType, 1, 4)
	none.Set(1, "ignored")
	none.Fail("ignored")
	none.Succeed("ignored")
	for _, id := range []string{"", " "} {
		if _, ok := store.get(id); ok {
			t.Fatal("missing progress ID created an entry")
		}
	}
}
