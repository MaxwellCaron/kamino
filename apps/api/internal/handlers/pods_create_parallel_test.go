package handlers

import (
	"context"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
)

func TestRunCreatePodClonesBoundedOverlapAndOrder(t *testing.T) {
	specs := []podCloneSpec{
		{Name: "vm-a"},
		{Name: "vm-b"},
		{Name: "vm-c"},
	}

	var inFlight atomic.Int32
	var maxInFlight atomic.Int32
	hold := make(chan struct{})
	overlap := make(chan struct{})
	var overlapOnce sync.Once
	go func() {
		<-overlap
		close(hold)
	}()

	results, reqErr := runCreatePodClones(context.Background(), 2, specs, func(ctx context.Context, index int, spec podCloneSpec) (createPodVMResult, *requestError) {
		current := inFlight.Add(1)
		for {
			prev := maxInFlight.Load()
			if current <= prev || maxInFlight.CompareAndSwap(prev, current) {
				break
			}
		}
		if current == 2 {
			overlapOnce.Do(func() { close(overlap) })
		}
		<-hold
		inFlight.Add(-1)

		return createPodVMResult{
			response: createPodVMResponse{VMID: 1000 + index},
			target:   podNetworkVMTarget{name: spec.Name},
		}, nil
	})
	if reqErr != nil {
		t.Fatalf("runCreatePodClones() reqErr = %v", reqErr)
	}

	if got := maxInFlight.Load(); got != 2 {
		t.Fatalf("max in-flight = %d, want 2", got)
	}
	for i, spec := range specs {
		if results[i].target.name != spec.Name {
			t.Fatalf("results[%d].target.name = %q, want %q", i, results[i].target.name, spec.Name)
		}
		if results[i].response.VMID != 1000+i {
			t.Fatalf("results[%d].response.VMID = %d, want %d", i, results[i].response.VMID, 1000+i)
		}
	}
}

func TestRunCreatePodClonesReturnsRequestErrorUnchanged(t *testing.T) {
	want := &requestError{
		Status:      http.StatusConflict,
		UserMessage: "clone conflict",
	}

	_, reqErr := runCreatePodClones(context.Background(), 2, []podCloneSpec{{Name: "vm-a"}}, func(ctx context.Context, index int, spec podCloneSpec) (createPodVMResult, *requestError) {
		return createPodVMResult{}, want
	})
	if reqErr != want {
		t.Fatalf("reqErr = %v, want %p", reqErr, want)
	}
}

func TestRunCreatePodClonesWrapsUnexpectedError(t *testing.T) {
	_, reqErr := runCreatePodClones(context.Background(), 2, []podCloneSpec{{Name: "vm-a"}}, func(ctx context.Context, index int, spec podCloneSpec) (createPodVMResult, *requestError) {
		return createPodVMResult{}, &requestError{Status: http.StatusBadGateway, UserMessage: "bad gateway"}
	})
	if reqErr == nil {
		t.Fatal("expected request error")
	}
	if reqErr.UserMessage != "bad gateway" {
		t.Fatalf("reqErr.UserMessage = %q, want bad gateway", reqErr.UserMessage)
	}
}

func TestRunCreatePodClonesOutOfOrderCompletionPreservesOrder(t *testing.T) {
	specs := []podCloneSpec{{Name: "slow"}, {Name: "fast"}}
	var gate sync.WaitGroup
	gate.Add(1)

	results, reqErr := runCreatePodClones(context.Background(), 2, specs, func(ctx context.Context, index int, spec podCloneSpec) (createPodVMResult, *requestError) {
		if index == 0 {
			gate.Wait()
		} else {
			gate.Done()
		}
		return createPodVMResult{
			response: createPodVMResponse{VMID: 2000 + index},
			target:   podNetworkVMTarget{name: spec.Name},
		}, nil
	})
	if reqErr != nil {
		t.Fatalf("runCreatePodClones() reqErr = %v", reqErr)
	}
	if results[0].target.name != "slow" || results[1].target.name != "fast" {
		t.Fatalf("results order = [%q, %q], want [slow fast]", results[0].target.name, results[1].target.name)
	}
}
