package handlers

import (
	"fmt"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
)

func TestClonedPodRuntimeStatus(t *testing.T) {
	tests := []struct {
		name     string
		statuses []string
		want     string
	}{
		{"empty returns partial", nil, "partial"},
		{"single running", []string{"running"}, "running"},
		{"single stopped", []string{"stopped"}, "stopped"},
		{"all running", []string{"running", "running"}, "running"},
		{"all stopped", []string{"stopped", "stopped"}, "stopped"},
		{"mixed returns partial", []string{"running", "stopped"}, "partial"},
		{"unknown status returns partial", []string{"running", "paused"}, "partial"},
		{"single unknown returns partial", []string{"paused"}, "partial"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := clonedPodRuntimeStatus(tt.statuses); got != tt.want {
				t.Errorf("clonedPodRuntimeStatus(%v) = %q, want %q", tt.statuses, got, tt.want)
			}
		})
	}
}

func TestVmidsFromTargets(t *testing.T) {
	targets := []vmactions.Target{
		{VMID: 100},
		{VMID: 200},
		{VMID: 300},
	}
	got := vmidsFromTargets(targets)
	if len(got) != 3 || got[0] != 100 || got[1] != 200 || got[2] != 300 {
		t.Errorf("vmidsFromTargets() = %v, want [100 200 300]", got)
	}

	got = vmidsFromTargets(nil)
	if len(got) != 0 {
		t.Errorf("nil input: got %v, want empty", got)
	}
}

func TestCloneMutationAllowed(t *testing.T) {
	owner := uuid.New()
	other := uuid.New()

	tests := []struct {
		name      string
		isManager bool
		owner     uuid.UUID
		actor     uuid.UUID
		want      bool
	}{
		{"owner non-manager allowed", false, owner, owner, true},
		{"non-owner non-manager denied", false, owner, other, false},
		{"non-owner manager allowed", true, owner, other, true},
		{"owner manager allowed", true, owner, owner, true},
		{"zero-value owner denied for non-manager", false, uuid.Nil, other, false},
		{"zero-value owner allowed for manager", true, uuid.Nil, other, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := cloneMutationAllowed(tt.isManager, tt.owner, tt.actor); got != tt.want {
				t.Errorf("cloneMutationAllowed(%v, %v, %v) = %v, want %v", tt.isManager, tt.owner, tt.actor, got, tt.want)
			}
		})
	}
}

func TestClonedPodVMAlreadyInPowerState(t *testing.T) {
	tests := []struct {
		name   string
		action string
		status string
		want   bool
	}{
		{"start when running", "start", "running", true},
		{"start when stopped", "start", "stopped", false},
		{"start when empty", "start", "", false},
		{"shutdown when stopped", "shutdown", "stopped", true},
		{"shutdown when running", "shutdown", "running", false},
		{"shutdown when empty", "shutdown", "", false},
		{"shutdown when paused", "shutdown", "paused", true},
		{"unknown action", "restart", "running", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := clonedPodVMAlreadyInPowerState(tt.action, tt.status); got != tt.want {
				t.Errorf("clonedPodVMAlreadyInPowerState(%q, %q) = %v, want %v", tt.action, tt.status, got, tt.want)
			}
		})
	}
}

func TestIsMissingProxmoxVMError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil error", nil, false},
		{"does not exist", fmt.Errorf("VM does not exist"), true},
		{"not found", fmt.Errorf("404 Not Found"), true},
		{"no such vm", fmt.Errorf("no such vm 123"), true},
		{"case insensitive", fmt.Errorf("VM Does Not Exist on node"), true},
		{"unrelated error", fmt.Errorf("connection refused"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isMissingProxmoxVMError(tt.err); got != tt.want {
				t.Errorf("isMissingProxmoxVMError(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}
