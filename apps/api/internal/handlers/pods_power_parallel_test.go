package handlers

import (
	"testing"

	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
)

func TestCloneFailedFromPowerResult(t *testing.T) {
	if cloneFailedFromPowerResult(podPowerResultResponse{}) {
		t.Fatal("expected no failures to be success")
	}
	if !cloneFailedFromPowerResult(podPowerResultResponse{
		Failed: []bulkVMActionFailure{{ID: uuid.New().String(), Error: "start failed"}},
	}) {
		t.Fatal("expected failures to mark clone failed")
	}
}

func TestPodPowerExpectedStatus(t *testing.T) {
	if got := podPowerExpectedStatus(vmactions.PowerActionStart); got != "running" {
		t.Fatalf("start = %q", got)
	}
	if got := podPowerExpectedStatus(vmactions.PowerActionShutdown); got != "stopped" {
		t.Fatalf("shutdown = %q", got)
	}
}

func TestUnconfirmedVMStatuses(t *testing.T) {
	expected := map[int]string{101: "running", 102: "stopped"}
	statuses := map[int]string{101: "running", 102: "running"}
	got := unconfirmedVMStatuses(expected, statuses)
	if len(got) != 1 || got[0] != 102 {
		t.Fatalf("unconfirmed = %v", got)
	}
}
