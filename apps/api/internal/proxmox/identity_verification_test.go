package proxmox

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

type identityReaderFunc func(context.Context, GuestType, string, int) (*VMIdentity, error)

func (fn identityReaderFunc) GetVMIdentity(ctx context.Context, gt GuestType, node string, vmid int) (*VMIdentity, error) {
	return fn(ctx, gt, node, vmid)
}

func TestVerifyVMIdentity(t *testing.T) {
	expected := uuid.New()
	upstreamFailure := errors.New("upstream unavailable")
	for _, tt := range []struct {
		name        string
		identity    *VMIdentity
		upstreamErr error
		wantErr     error
	}{
		{"matching template", &VMIdentity{UpstreamUUID: expected, IsTemplate: true}, nil, nil},
		{"reused VMID", &VMIdentity{UpstreamUUID: uuid.New()}, nil, ErrVMIdentityMismatch},
		{"unconfigured", nil, ErrVMIdentityNotConfigured, ErrVMIdentityNotConfigured},
		{"invalid", nil, ErrVMIdentityInvalid, ErrVMIdentityInvalid},
		{"upstream failure", nil, upstreamFailure, upstreamFailure},
	} {
		t.Run(tt.name, func(t *testing.T) {
			reader := identityReaderFunc(func(ctx context.Context, gt GuestType, node string, vmid int) (*VMIdentity, error) {
				if gt != GuestLXC || node != "node-a" || vmid != 101 {
					t.Fatalf("wrong target: %s %s %d", gt, node, vmid)
				}
				return tt.identity, tt.upstreamErr
			})
			identity, err := VerifyVMIdentity(context.Background(), reader, GuestLXC, "node-a", 101, expected)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if tt.wantErr == nil && identity != tt.identity {
				t.Fatal("verified identity metadata was not preserved")
			}
			if tt.wantErr != nil && identity != nil {
				t.Fatal("failed verification returned an identity")
			}
		})
	}
}
