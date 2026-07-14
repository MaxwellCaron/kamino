package handlers

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
)

func TestCloneFailedFromPowerResult(t *testing.T) {
	if cloneFailedFromPowerResult(podPowerExecutionResult{}) {
		t.Fatal("expected no failures to be success")
	}
	if !cloneFailedFromPowerResult(podPowerExecutionResult{
		Failed: []bulkVMActionFailure{{ID: uuid.New().String(), Error: "start failed"}},
	}) {
		t.Fatal("expected failures to mark clone failed")
	}
}

func TestPodPowerResultToPublicResponse(t *testing.T) {
	succeededID := uuid.New()
	failedID := uuid.New()

	tests := []struct {
		name   string
		result podPowerExecutionResult
		want   podPowerResultResponse
	}{
		{
			name: "all succeeded",
			result: podPowerExecutionResult{
				Action:    "start",
				Succeeded: []uuid.UUID{succeededID},
				Failed:    nil,
			},
			want: podPowerResultResponse{
				Action: "start",
				Status: podPowerStatusSucceeded,
			},
		},
		{
			name: "mixed with already-correct target",
			result: podPowerExecutionResult{
				Action:    "shutdown",
				Succeeded: []uuid.UUID{succeededID},
				Failed: []bulkVMActionFailure{
					{ID: failedID.String(), Error: "shutdown failed"},
				},
			},
			want: podPowerResultResponse{
				Action: "shutdown",
				Status: podPowerStatusPartial,
			},
		},
		{
			name: "all failed",
			result: podPowerExecutionResult{
				Action: "start",
				Failed: []bulkVMActionFailure{
					{ID: failedID.String(), Error: "start failed"},
				},
			},
			want: podPowerResultResponse{
				Action: "start",
				Status: podPowerStatusFailed,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.result.toPublicResponse()
			if got != tt.want {
				t.Fatalf("toPublicResponse() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestPodPowerResultPublicJSONPrivacy(t *testing.T) {
	hiddenID := uuid.MustParse("00000000-0000-4000-8000-00000000dead")
	internalError := "distinctive-internal-vm-error-string"

	result := podPowerExecutionResult{
		Action:    "start",
		Succeeded: []uuid.UUID{uuid.New()},
		Failed: []bulkVMActionFailure{
			{ID: hiddenID.String(), Error: internalError},
		},
	}

	public := result.toPublicResponse()
	data, err := json.Marshal(public)
	if err != nil {
		t.Fatalf("marshal public response: %v", err)
	}

	const wantJSON = `{"action":"start","status":"partial"}`
	if string(data) != wantJSON {
		t.Fatalf("public JSON = %s, want %s", data, wantJSON)
	}

	payload := string(data)
	for _, forbidden := range []string{
		hiddenID.String(),
		internalError,
		`"succeeded"`,
		`"failed"`,
		`"count"`,
		`"id"`,
		`"vmid"`,
		`"name"`,
		`"error"`,
	} {
		if strings.Contains(payload, forbidden) {
			t.Fatalf("public JSON must not contain %q: %s", forbidden, payload)
		}
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
