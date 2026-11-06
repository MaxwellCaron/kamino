package handlers

import (
	"net/http"
	"testing"
	"testing/synctest"
	"time"

	"github.com/google/uuid"
)

func TestPodProgressWorkflowStates(t *testing.T) {
	tests := []struct {
		name, eventType, batchID   string
		initial, last, wantSuccess int
		newReporter                func(*PodProgress) *podProgressReporter
	}{
		{"publish", publishProgressEventType, "", publishProgressStepValidating, publishProgressStepCloning, publishProgressStepSaving, func(p *PodProgress) *podProgressReporter { return p.publishReporter(" operation ") }},
		{"create", createProgressEventType, "", createProgressStepValidating, createProgressStepConfiguring, createProgressStepConfiguring, func(p *PodProgress) *podProgressReporter { return p.createReporter(" operation ") }},
		{"clone", cloneProgressEventType, "batch", cloneProgressStepFetching, cloneProgressStepCloning, cloneProgressStepRouter, func(p *PodProgress) *podProgressReporter { return p.cloneReporter(" operation ", " batch ") }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reporter := tt.newReporter(&PodProgress{})
			store := reporter.store
			reporter.fail("invalid")
			initial, ok := store.get("operation")
			if !ok || initial.StepID != tt.initial || initial.State != podProgressStateError {
				t.Fatalf("initial failure = %+v, found %v", initial, ok)
			}
			reporter.set(tt.last, "working")
			reporter.fail("failed")
			failed, _ := store.get("operation")
			if failed.StepID != tt.last || failed.State != podProgressStateError {
				t.Fatalf("failure must retain last step: %+v", failed)
			}
			reporter.succeed("done")
			snapshot, _ := store.get("operation")
			if snapshot.Type != tt.eventType || snapshot.BatchID != tt.batchID || snapshot.StepID != tt.wantSuccess || snapshot.State != podProgressStateSuccess || snapshot.Message != "done" || snapshot.UpdatedAt.IsZero() {
				t.Fatalf("terminal snapshot = %+v", snapshot)
			}
		})
	}
}

func TestPodProgressStoresAreScopedToHandlerAndWorkflow(t *testing.T) {
	first, second := &PodsHandler{}, &PodsHandler{}
	first.Progress.cloneReporter("operation", "").set(2, "cloning")
	principal := uuid.New()
	for _, tt := range []struct {
		handler *PodsHandler
		want    int
	}{{first, http.StatusOK}, {second, http.StatusNotFound}} {
		router := newVMTestEngine(http.MethodGet, "/progress/:id", principal, tt.handler.GetCloneProgress)
		response := doJSONRequest(router, http.MethodGet, "/progress/operation", "")
		assertStatus(t, response, tt.want)
	}
	if _, ok := first.Progress.publish.get("operation"); ok {
		t.Fatal("clone progress leaked into publish progress")
	}
}

func TestPodProgressExpiryCannotRemoveNewRun(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		var progress PodProgress
		reporter := progress.cloneReporter("operation", "")
		reporter.succeed("old run")
		time.Sleep(30 * time.Second)
		reporter.set(1, "new run")
		time.Sleep(30 * time.Second)
		synctest.Wait()
		if current, ok := progress.clone.get("operation"); !ok || current.Message != "new run" {
			t.Fatalf("old expiration removed new run: %+v, found %v", current, ok)
		}
		reporter.succeed("new run done")
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
		store.reporter(id, "batch", cloneProgressEventType, 1, 4).set(2, "cloning")
		select {
		case update := <-updates:
			if update.ID != id || update.Type != cloneProgressEventType {
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
	none := store.reporter(" ", "", cloneProgressEventType, 1, 4)
	none.set(1, "ignored")
	none.fail("ignored")
	none.succeed("ignored")
	for _, id := range []string{"", " "} {
		if _, ok := store.get(id); ok {
			t.Fatal("missing progress ID created an entry")
		}
	}
}
