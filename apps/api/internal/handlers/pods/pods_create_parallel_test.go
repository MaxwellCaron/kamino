package pods

import (
	"context"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"

	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
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

	results, reqErr := runCreatePodClones(context.Background(), 2, specs, func(ctx context.Context, index int, spec podCloneSpec) (createPodVMResult, *httpx.RequestError) {
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
	want := &httpx.RequestError{
		Status:      http.StatusConflict,
		UserMessage: "clone conflict",
	}

	_, reqErr := runCreatePodClones(context.Background(), 2, []podCloneSpec{{Name: "vm-a"}}, func(ctx context.Context, index int, spec podCloneSpec) (createPodVMResult, *httpx.RequestError) {
		return createPodVMResult{}, want
	})
	if reqErr != want {
		t.Fatalf("reqErr = %v, want %p", reqErr, want)
	}
}

func TestRunCreatePodClonesOutOfOrderCompletionPreservesOrder(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		specs := []podCloneSpec{{Name: "slow"}, {Name: "fast"}}
		hold := make(chan struct{})
		done := make(chan []createPodVMResult, 1)
		go func() {
			results, reqErr := runCreatePodClones(context.Background(), 2, specs, func(ctx context.Context, index int, spec podCloneSpec) (createPodVMResult, *httpx.RequestError) {
				if index == 0 {
					<-hold
				}
				return createPodVMResult{
					response: createPodVMResponse{VMID: 2000 + index},
					target:   podNetworkVMTarget{name: spec.Name},
				}, nil
			})
			if reqErr != nil {
				t.Errorf("runCreatePodClones() reqErr = %v", reqErr)
			}
			done <- results
		}()
		synctest.Wait()
		close(hold)
		results := <-done
		if len(results) != 2 || results[0].target.name != "slow" || results[1].target.name != "fast" {
			t.Fatalf("results = %+v, want [slow fast]", results)
		}
	})
}
