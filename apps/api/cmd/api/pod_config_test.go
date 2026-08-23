package main

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestResolvePersonalPodRouterTemplateItemID(t *testing.T) {
	defaultID := uuid.New()
	overrideID := uuid.New()

	got, err := resolvePersonalPodRouterTemplateItemID(true, "", defaultID)
	if err != nil || got != defaultID {
		t.Fatalf("blank override resolved to %s with error %v, want %s", got, err, defaultID)
	}

	got, err = resolvePersonalPodRouterTemplateItemID(true, overrideID.String(), defaultID)
	if err != nil || got != overrideID {
		t.Fatalf("explicit override resolved to %s with error %v, want %s", got, err, overrideID)
	}

	if _, err := resolvePersonalPodRouterTemplateItemID(false, "invalid", defaultID); err == nil {
		t.Fatal("invalid explicit override should return an error")
	}

	got, err = resolvePersonalPodRouterTemplateItemID(false, "", uuid.Nil)
	if err != nil || got != uuid.Nil {
		t.Fatalf("disabled personal pods without a template resolved to %s with error %v", got, err)
	}

	if _, err := resolvePersonalPodRouterTemplateItemID(true, "", uuid.Nil); err == nil {
		t.Fatal("enabled personal pods without a router template should return an error")
	}
}

func TestResolveVMTemplatesFolderItemID(t *testing.T) {
	generalID := uuid.New()
	overrideID := uuid.New()

	got, err := resolveVMTemplatesFolderItemID("", generalID)
	if err != nil || got != generalID {
		t.Fatalf("blank override resolved to %s with error %v, want %s", got, err, generalID)
	}

	got, err = resolveVMTemplatesFolderItemID(overrideID.String(), generalID)
	if err != nil || got != overrideID {
		t.Fatalf("explicit override resolved to %s with error %v, want %s", got, err, overrideID)
	}

	if _, err := resolveVMTemplatesFolderItemID("invalid", generalID); err == nil {
		t.Fatal("invalid explicit override should return an error")
	}

	got, err = resolveVMTemplatesFolderItemID("", uuid.Nil)
	if err != nil || got != uuid.Nil {
		t.Fatalf("both blank resolved to %s with error %v, want uuid.Nil", got, err)
	}
}

func TestBuildPodRouterCloneConfig(t *testing.T) {
	tests := []struct {
		name    string
		wait    string
		wantErr string
	}{
		{name: "valid", wait: " 5m "},
		{name: "invalid", wait: "later", wantErr: "invalid POD_ROUTER_WAIT_TIMEOUT"},
		{name: "zero", wait: "0s", wantErr: "POD_ROUTER_WAIT_TIMEOUT must be positive"},
		{name: "negative", wait: "-1s", wantErr: "POD_ROUTER_WAIT_TIMEOUT must be positive"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			routerConfig, err := buildPodRouterCloneConfig(&Config{PodRouterWait: tt.wait})
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error containing %q", tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error = %q, want substring %q", err.Error(), tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if routerConfig.RouterWaitTimeout != 5*time.Minute {
				t.Fatalf("RouterWaitTimeout = %s, want 5m", routerConfig.RouterWaitTimeout)
			}
		})
	}
}
