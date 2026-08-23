package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/personalpods"
	"github.com/google/uuid"
)

func TestRequestErrorFromPersonalPodsError(t *testing.T) {
	tests := []struct {
		kind personalpods.Kind
		want int
	}{
		{personalpods.KindDisabled, http.StatusConflict},
		{personalpods.KindConflict, http.StatusConflict},
		{personalpods.KindNotFound, http.StatusNotFound},
		{personalpods.KindValidation, http.StatusUnprocessableEntity},
		{personalpods.KindUpstream, http.StatusBadGateway},
		{personalpods.KindInternal, http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(string(tt.kind), func(t *testing.T) {
			cause := errors.New("wrapped cause")
			appErr := &personalpods.Error{
				Kind:        tt.kind,
				UserMessage: "safe message",
				Operation:   "some operation",
				Err:         cause,
			}
			got := requestErrorFromPersonalPodsError(appErr)
			if got.Status != tt.want {
				t.Fatalf("Status = %d, want %d", got.Status, tt.want)
			}
			if got.UserMessage != "safe message" {
				t.Fatalf("UserMessage = %q, want %q", got.UserMessage, "safe message")
			}
			if got.Operation != "some operation" || !errors.Is(got.Err, cause) {
				t.Fatalf("Operation/Err not preserved: got %+v", got)
			}
		})
	}
}

func TestPersonalPodCreateResultSuccess(t *testing.T) {
	folderID := uuid.New()

	reqErr, response := personalPodCreateResult(folderID, nil)
	if reqErr != nil {
		t.Fatalf("unexpected error: %+v", reqErr)
	}
	if response.FolderID != folderID {
		t.Fatalf("FolderID = %v, want %v", response.FolderID, folderID)
	}
}

func TestPersonalPodCreateResultTypedError(t *testing.T) {
	appErr := &personalpods.Error{Kind: personalpods.KindConflict, UserMessage: "personal pod already exists"}

	reqErr, response := personalPodCreateResult(uuid.Nil, appErr)
	if reqErr == nil {
		t.Fatal("expected a request error")
	}
	if reqErr.Status != http.StatusConflict || reqErr.UserMessage != "personal pod already exists" {
		t.Fatalf("reqErr = %+v", reqErr)
	}
	if response.FolderID != uuid.Nil {
		t.Fatalf("response should be zero-value on error, got %+v", response)
	}
}

func TestPersonalPodCreateResultUntypedErrorFallsBackToInternal(t *testing.T) {
	reqErr, _ := personalPodCreateResult(uuid.Nil, fmt.Errorf("boom"))
	if reqErr == nil || reqErr.Status != http.StatusInternalServerError {
		t.Fatalf("reqErr = %+v, want 500", reqErr)
	}
}

func TestPersonalPodNetworkMetadataUsesCloneTarget(t *testing.T) {
	handler := &PodsHandler{NetworkCatalog: testNetworkCatalog(t)}
	target := podCloneTarget{
		Key:        "personal",
		Label:      "Personal",
		LANVNet:    "personal",
		WANBridge:  "personalwan",
		WANSubnet:  "172.25.0.0/16",
		NetworkMin: 1,
		NetworkMax: 94,
		IsPersonal: true,
	}

	got, err := handler.personalPodNetworkMetadata(target, 24)
	if err != nil {
		t.Fatalf("personalPodNetworkMetadata() error = %v", err)
	}
	if got.VNet != "personal" || got.LANVLANTag != 24 {
		t.Fatalf("metadata = %#v", got)
	}
	if got.ExternalSubnet != "172.25.24.0/24" || got.ExternalGateway != "172.25.24.1" {
		t.Fatalf("external metadata = %#v", got)
	}
	if got.InternalSubnet != "192.168.1.0/24" {
		t.Fatalf("internal subnet = %q", got.InternalSubnet)
	}
}
