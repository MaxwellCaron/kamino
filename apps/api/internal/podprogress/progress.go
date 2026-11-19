package podprogress

import (
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/internal/events"
)

const (
	podProgressRetention    = 60 * time.Second
	podProgressStateRunning = "running"
	podProgressStateSuccess = "success"
	podProgressStateError   = "error"
)

type Tracker struct {
	publish podProgressStore
	create  podProgressStore
	clone   podProgressStore
}

type Snapshot struct {
	Type      string    `json:"type"`
	ID        string    `json:"id"`
	BatchID   string    `json:"batch_id,omitempty"`
	State     string    `json:"state"`
	StepID    int       `json:"step_id"`
	Message   string    `json:"message"`
	UpdatedAt time.Time `json:"updated_at"`
}

type podProgressStore struct {
	mu     sync.RWMutex
	items  map[string]*Snapshot
	events events.Broadcaster[Snapshot]
}

type Reporter struct {
	id          string
	batchID     string
	eventType   string
	store       *podProgressStore
	mu          sync.Mutex
	step        int
	successStep int
}

func (s *podProgressStore) get(id string) (Snapshot, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	snapshot, ok := s.items[id]
	if !ok {
		return Snapshot{}, false
	}
	return *snapshot, true
}

func (s *podProgressStore) getBatch(batchID string) []Snapshot {
	batchID = strings.TrimSpace(batchID)
	result := make([]Snapshot, 0)
	if batchID == "" {
		return result
	}

	s.mu.RLock()
	for _, snapshot := range s.items {
		if snapshot.BatchID == batchID {
			result = append(result, *snapshot)
		}
	}
	s.mu.RUnlock()

	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})
	return result
}

func (s *podProgressStore) set(snapshot Snapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.items == nil {
		s.items = make(map[string]*Snapshot)
	}
	snapshot.UpdatedAt = time.Now().UTC()
	s.items[snapshot.ID] = &snapshot

	s.events.Broadcast(snapshot)

	if snapshot.State != podProgressStateRunning {
		time.AfterFunc(podProgressRetention, func() {
			s.expire(&snapshot)
		})
	}
}

func (s *podProgressStore) expire(snapshot *Snapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.items[snapshot.ID] == snapshot {
		delete(s.items, snapshot.ID)
	}
}

func (s *podProgressStore) reporter(id, batchID, eventType string, initialStep, successStep int) *Reporter {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}
	return &Reporter{
		id:          id,
		batchID:     strings.TrimSpace(batchID),
		eventType:   eventType,
		store:       s,
		step:        initialStep,
		successStep: successStep,
	}
}

func (r *Reporter) Set(step int, message string) {
	r.emit(step, podProgressStateRunning, message)
}

func (r *Reporter) Succeed(message string) {
	if r == nil {
		return
	}
	r.emit(r.successStep, podProgressStateSuccess, message)
}

func (r *Reporter) Fail(message string) {
	r.emit(0, podProgressStateError, message)
}

func (r *Reporter) emit(step int, state, message string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if step != 0 {
		r.step = step
	}
	r.store.set(Snapshot{
		Type:    r.eventType,
		ID:      r.id,
		BatchID: r.batchID,
		State:   state,
		StepID:  r.step,
		Message: message,
	})
}

func (p *Tracker) SubscribePublish() (<-chan Snapshot, func()) {
	return p.publish.events.Subscribe()
}

func (p *Tracker) GetCreate(id string) (Snapshot, bool)    { return p.create.get(id) }
func (p *Tracker) GetPublish(id string) (Snapshot, bool)   { return p.publish.get(id) }
func (p *Tracker) GetClone(id string) (Snapshot, bool)     { return p.clone.get(id) }
func (p *Tracker) GetCloneBatch(batchID string) []Snapshot { return p.clone.getBatch(batchID) }
