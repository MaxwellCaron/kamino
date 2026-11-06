package events

import (
	"sync"
	"testing"
)

func TestBroadcasterSlowSubscriberDoesNotBlockOthers(t *testing.T) {
	var broadcaster Broadcaster[int]
	slow, cancelSlow := broadcaster.Subscribe()
	defer cancelSlow()
	for value := range 16 {
		broadcaster.Broadcast(value)
	}
	fast, cancelFast := broadcaster.Subscribe()
	defer cancelFast()
	broadcaster.Broadcast(99)
	if got := <-fast; got != 99 {
		t.Fatalf("fast subscriber received %d", got)
	}
	for value := range 16 {
		if got := <-slow; got != value {
			t.Fatalf("slow subscriber received %d, want %d", got, value)
		}
	}
	select {
	case got := <-slow:
		t.Fatalf("full subscriber retained dropped event %d", got)
	default:
	}
}

func TestBroadcasterConcurrentCancellation(t *testing.T) {
	var broadcaster Broadcaster[int]
	var workers sync.WaitGroup
	for range 20 {
		workers.Go(func() {
			updates, cancel := broadcaster.Subscribe()
			for range 20 {
				broadcaster.Broadcast(1)
			}
			cancel()
			cancel()
			for range updates {
			}
		})
	}
	workers.Wait()
	updates, cancel := broadcaster.Subscribe()
	broadcaster.Broadcast(42)
	if got := <-updates; got != 42 {
		t.Fatalf("received %d", got)
	}
	cancel()
}
