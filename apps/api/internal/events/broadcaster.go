package events

import "sync"

// Broadcaster delivers best-effort updates; slow subscribers may miss events.
// Its zero value is ready for use.
type Broadcaster[T any] struct {
	mu          sync.RWMutex
	subscribers map[chan T]struct{}
}

func (b *Broadcaster[T]) Subscribe() (<-chan T, func()) {
	ch := make(chan T, 16)
	b.mu.Lock()
	if b.subscribers == nil {
		b.subscribers = make(map[chan T]struct{})
	}
	b.subscribers[ch] = struct{}{}
	b.mu.Unlock()
	return ch, func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		if _, ok := b.subscribers[ch]; ok {
			delete(b.subscribers, ch)
			close(ch)
		}
	}
}

func (b *Broadcaster[T]) Broadcast(event T) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.subscribers {
		select {
		case ch <- event:
		default:
		}
	}
}
