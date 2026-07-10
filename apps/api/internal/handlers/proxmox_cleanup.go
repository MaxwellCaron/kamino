package handlers

import (
	"context"
	"log"
	"time"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

type proxmoxVMDeleter interface {
	DeleteVM(ctx context.Context, gt proxmox.GuestType, node string, vmid int) error
}

func cleanupProxmoxVM(parent context.Context, px proxmoxVMDeleter, node string, vmid int, reason string) {
	if px == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), 30*time.Second)
	defer cancel()

	if err := px.DeleteVM(ctx, proxmox.GuestQEMU, node, vmid); err != nil {
		log.Printf("proxmox cleanup after %s: failed to delete VM %d on %s: %v", reason, vmid, node, err)
	}
}
