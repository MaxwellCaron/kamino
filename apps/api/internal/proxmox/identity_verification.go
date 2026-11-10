package proxmox

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

var ErrVMIdentityMismatch = errors.New("upstream VM identity no longer matches inventory")

type VMIdentityReader interface {
	GetVMIdentity(context.Context, GuestType, string, int) (*VMIdentity, error)
}

func VerifyVMIdentity(ctx context.Context, reader VMIdentityReader, guestType GuestType, node string, vmid int, expected uuid.UUID) (*VMIdentity, error) {
	identity, err := reader.GetVMIdentity(ctx, guestType, node, vmid)
	if err != nil {
		return nil, err
	}
	if identity.UpstreamUUID != expected {
		return nil, ErrVMIdentityMismatch
	}
	return identity, nil
}
