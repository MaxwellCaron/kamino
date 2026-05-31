package handlers

import (
	"strings"
	"sync"
	"time"
)

const (
	publishProgressEventType    = "pod.publish.progress"
	publishProgressStateRunning = "running"
	publishProgressStateSuccess = "success"
	publishProgressStateError   = "error"

	publishProgressStepValidating = 1
	publishProgressStepPreparing  = 2
	publishProgressStepCloning    = 3
	publishProgressStepTemplating = 4
	publishProgressStepSaving     = 5
)

var publishedPodProgress = newPublishPodProgressStore()

type publishPodProgressSnapshot struct {
	Type          string    `json:"type"`
	ID            string    `json:"id"`
	State         string    `json:"state"`
	StepID        int       `json:"step_id"`
	TotalVMs      int       `json:"total_vms"`
	CompletedVMs  int       `json:"completed_vms"`
	CurrentVMName string    `json:"current_vm_name,omitempty"`
	Message       string    `json:"message"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type publishPodProgressStore struct {
	mu          sync.RWMutex
	items       map[string]publishPodProgressSnapshot
	subscribers map[chan publishPodProgressSnapshot]struct{}
}

func newPublishPodProgressStore() *publishPodProgressStore {
	return &publishPodProgressStore{
		items:       make(map[string]publishPodProgressSnapshot),
		subscribers: make(map[chan publishPodProgressSnapshot]struct{}),
	}
}

func (s *publishPodProgressStore) get(id string) (publishPodProgressSnapshot, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	snapshot, ok := s.items[id]
	return snapshot, ok
}

func (s *publishPodProgressStore) set(snapshot publishPodProgressSnapshot) {
	s.mu.Lock()
	if snapshot.Type == "" {
		snapshot.Type = publishProgressEventType
	}
	snapshot.UpdatedAt = time.Now().UTC()
	s.items[snapshot.ID] = snapshot

	subscribers := make([]chan publishPodProgressSnapshot, 0, len(s.subscribers))
	for ch := range s.subscribers {
		subscribers = append(subscribers, ch)
	}
	s.mu.Unlock()

	for _, ch := range subscribers {
		select {
		case ch <- snapshot:
		default:
		}
	}
}

func (s *publishPodProgressStore) subscribe() (<-chan publishPodProgressSnapshot, func()) {
	ch := make(chan publishPodProgressSnapshot, 16)

	s.mu.Lock()
	s.subscribers[ch] = struct{}{}
	s.mu.Unlock()

	return ch, func() {
		s.mu.Lock()
		if _, ok := s.subscribers[ch]; ok {
			delete(s.subscribers, ch)
			close(ch)
		}
		s.mu.Unlock()
	}
}

type publishPodProgressReporter struct {
	id       string
	store    *publishPodProgressStore
	totalVMs int
	mu       sync.Mutex
	last     publishPodProgressSnapshot
}

func newPublishPodProgressReporter(id string, totalVMs int) *publishPodProgressReporter {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}

	return &publishPodProgressReporter{
		id:       id,
		store:    publishedPodProgress,
		totalVMs: totalVMs,
	}
}

func (r *publishPodProgressReporter) update(stepID int, completedVMs int, currentVMName string, message string) {
	if r == nil {
		return
	}

	snapshot := publishPodProgressSnapshot{
		ID:            r.id,
		State:         publishProgressStateRunning,
		StepID:        stepID,
		TotalVMs:      r.totalVMs,
		CompletedVMs:  completedVMs,
		CurrentVMName: currentVMName,
		Message:       message,
	}
	r.remember(snapshot)
	r.store.set(snapshot)
}

func (r *publishPodProgressReporter) fail(message string) {
	if r == nil {
		return
	}

	snapshot := r.snapshot()
	if snapshot.ID == "" {
		snapshot = publishPodProgressSnapshot{
			ID:       r.id,
			StepID:   publishProgressStepValidating,
			TotalVMs: r.totalVMs,
		}
	}
	snapshot.State = publishProgressStateError
	snapshot.Message = message
	r.remember(snapshot)
	r.store.set(snapshot)
}

func (r *publishPodProgressReporter) succeed(message string) {
	if r == nil {
		return
	}

	snapshot := publishPodProgressSnapshot{
		ID:           r.id,
		State:        publishProgressStateSuccess,
		StepID:       publishProgressStepSaving,
		TotalVMs:     r.totalVMs,
		CompletedVMs: r.totalVMs,
		Message:      message,
	}
	r.remember(snapshot)
	r.store.set(snapshot)
}

func (r *publishPodProgressReporter) snapshot() publishPodProgressSnapshot {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.last
}

func (r *publishPodProgressReporter) remember(snapshot publishPodProgressSnapshot) {
	r.mu.Lock()
	r.last = snapshot
	r.mu.Unlock()
}
