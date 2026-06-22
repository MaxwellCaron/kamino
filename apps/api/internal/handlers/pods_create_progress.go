package handlers

import (
	"strings"
	"sync"
)

const (
	createProgressEventType       = "pod.create.progress"
	createProgressStepValidating  = 1
	createProgressStepFolders     = 2
	createProgressStepNetwork     = 3
	createProgressStepCloning     = 4
	createProgressStepWaiting     = 5
	createProgressStepConfiguring = 6
	createProgressStepRouter      = 7
)

var createPodProgress = newPublishPodProgressStore()

type createPodProgressReporter struct {
	id    string
	store *publishPodProgressStore
	mu    sync.Mutex
	step  int
}

func newCreatePodProgressReporter(id string) *createPodProgressReporter {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}
	return &createPodProgressReporter{id: id, store: createPodProgress}
}

func (r *createPodProgressReporter) set(step int, message string) {
	r.emit(step, publishProgressStateRunning, message)
}

func (r *createPodProgressReporter) succeed(message string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	step := r.step
	r.mu.Unlock()
	if step == 0 {
		step = createProgressStepValidating
	}
	r.emit(step, publishProgressStateSuccess, message)
}

func (r *createPodProgressReporter) fail(message string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	step := r.step
	r.mu.Unlock()
	if step == 0 {
		step = createProgressStepValidating
	}
	r.emit(step, publishProgressStateError, message)
}

func (r *createPodProgressReporter) emit(step int, state, message string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.step = step
	r.mu.Unlock()
	r.store.set(publishPodProgressSnapshot{
		Type:    createProgressEventType,
		ID:      r.id,
		State:   state,
		StepID:  step,
		Message: message,
	})
}
