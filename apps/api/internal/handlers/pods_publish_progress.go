package handlers

import (
	"sort"
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
	publishProgressStepSaving     = 4

	publishProgressRetention = 60 * time.Second
)

var publishedPodProgress = newPublishPodProgressStore()

type publishPodProgressSnapshot struct {
	Type      string    `json:"type"`
	ID        string    `json:"id"`
	BatchID   string    `json:"batch_id,omitempty"`
	State     string    `json:"state"`
	StepID    int       `json:"step_id"`
	Message   string    `json:"message"`
	UpdatedAt time.Time `json:"updated_at"`
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

func (s *publishPodProgressStore) getBatch(batchID string) []publishPodProgressSnapshot {
	batchID = strings.TrimSpace(batchID)
	if batchID == "" {
		return []publishPodProgressSnapshot{}
	}

	s.mu.RLock()
	result := make([]publishPodProgressSnapshot, 0)
	for _, snapshot := range s.items {
		if snapshot.BatchID == batchID {
			result = append(result, snapshot)
		}
	}
	s.mu.RUnlock()

	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})
	return result
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

	// Drop terminal snapshots after a grace period so the store stays bounded.
	if snapshot.State != publishProgressStateRunning {
		time.AfterFunc(publishProgressRetention, func() {
			s.mu.Lock()
			delete(s.items, snapshot.ID)
			s.mu.Unlock()
		})
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

// publishPodProgressReporter publishes a step + message for a publish run. Its
// methods are safe to call from concurrent clone workers and no-op on a nil
// reporter (when no progress id was supplied).
type publishPodProgressReporter struct {
	id    string
	store *publishPodProgressStore
	mu    sync.Mutex
	step  int
}

func newPublishPodProgressReporter(id string) *publishPodProgressReporter {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}
	return &publishPodProgressReporter{id: id, store: publishedPodProgress}
}

func (r *publishPodProgressReporter) set(step int, message string) {
	r.emit(step, publishProgressStateRunning, message)
}

func (r *publishPodProgressReporter) succeed(message string) {
	r.emit(publishProgressStepSaving, publishProgressStateSuccess, message)
}

func (r *publishPodProgressReporter) fail(message string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	step := r.step
	r.mu.Unlock()
	if step == 0 {
		step = publishProgressStepValidating
	}
	r.emit(step, publishProgressStateError, message)
}

func (r *publishPodProgressReporter) emit(step int, state, message string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.step = step
	r.mu.Unlock()
	r.store.set(publishPodProgressSnapshot{ID: r.id, State: state, StepID: step, Message: message})
}
