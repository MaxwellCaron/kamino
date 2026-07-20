package handlers

import (
	"context"
	"net/http"
	"strconv"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func parseIntParam(c *gin.Context, name string) (int, error) {
	val, err := strconv.Atoi(c.Param(name))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid " + name})
	}
	return val, err
}

// vmProxmox is the seam VMHandler uses to talk to Proxmox
type vmProxmox interface {
	GetVMIdentity(ctx context.Context, gt proxmox.GuestType, node string, vmid int) (*proxmox.VMIdentity, error)
	GetVMs(ctx context.Context) ([]proxmox.VM, error)
	RenameVM(ctx context.Context, gt proxmox.GuestType, node string, vmid int, name string) error
	UpdateVMNotes(ctx context.Context, gt proxmox.GuestType, node string, vmid int, notes string) error
	GetVMHardwareConfig(ctx context.Context, node string, vmid int) (*proxmox.VMHardwareConfig, error)
	GetLXCNetworks(ctx context.Context, node string, vmid int) ([]proxmox.VMHardwareNetwork, error)
	UpdateVMHardware(ctx context.Context, node string, vmid int, config proxmox.VMHardwareConfig) error
	GetOptimalNode(ctx context.Context) (proxmox.Node, error)
	GetNextVMID(ctx context.Context) (int, error)
	IsVMIDAvailable(ctx context.Context, vmid int) (bool, error)
	CloneVM(ctx context.Context, node string, vmid int, newid int, name string, full bool, target string) error
	SetVMUpstreamUUID(ctx context.Context, node string, vmid int, upstreamUUID uuid.UUID) error
	SyncVMPoolMembership(ctx context.Context, node string, vmid int, desiredPool string, path []string) error
	GetSnapshots(ctx context.Context, gt proxmox.GuestType, node string, vmid int) ([]proxmox.Snapshot, error)
	DeleteSnapshot(ctx context.Context, gt proxmox.GuestType, node string, vmid int, snapname string) error
	ConvertToTemplate(ctx context.Context, node string, vmid int) error
	DeleteVM(ctx context.Context, gt proxmox.GuestType, node string, vmid int) error
}

// vmAuthz is the seam VMHandler uses to talk to the authorization service
type vmAuthz interface {
	Require(ctx context.Context, principalID uuid.UUID, itemID uuid.UUID, required authorization.Mask) error
	GetVMRecord(ctx context.Context, itemID uuid.UUID) (authorization.VMRecord, error)
	GetVMRecordForUpdate(ctx context.Context, itemID uuid.UUID) (authorization.VMRecord, error)
	ResolveVMItems(ctx context.Context, principalID uuid.UUID, itemIDs []uuid.UUID, required authorization.Mask, lock bool) (map[uuid.UUID]authorization.VMItemAccess, error)
	FilterVisibleStatuses(ctx context.Context, principalID uuid.UUID, statuses map[int]string) (map[int]string, error)
	IsManager(ctx context.Context, principalID uuid.UUID) (bool, error)
}

// VMHandler handles all VM-related API endpoints (status, power, snapshots, etc.).
type VMHandler struct {
	PX                    vmProxmox
	DB                    *pgxpool.Pool
	Importer              *proxmox.InventoryImporter
	Service               *inventory.Service
	Notifier              *vmstatus.Notifier
	Authz                 vmAuthz
	Actions               *vmactions.Executor
	Claims                *vmactions.Claims
	Audit                 *audit.Service
	Allocator             *vmidalloc.Allocator
	PersonalPodVNetPrefix string
	PersonalPodVLANBase   int
}

// writeActionInProgress writes a deterministic 409 Conflict response when a
// VM action claim is already held for the target item.
func writeActionInProgress(c *gin.Context) {
	writeConflict(c, "another action is already in progress for this VM")
}

// runClaimedVMAction claims itemID for the given action name before running
func (h *VMHandler) runClaimedVMAction(
	c *gin.Context,
	itemID uuid.UUID,
	action string,
	principalID uuid.UUID,
	fn func() bool,
) bool {
	ctx := c.Request.Context()

	if err := h.Claims.Claim(ctx, itemID, action, principalID, ""); err != nil {
		if vmactions.IsActionInProgress(err) {
			writeActionInProgress(c)
			return false
		}
		writeLoggedError(c, http.StatusInternalServerError, "failed to claim vm for mutation", "claim vm action", err)
		return false
	}
	defer func() {
		_ = h.Claims.Release(ctx, itemID)
	}()

	return fn()
}

// GetStatuses returns a map of vmid -> status directly from Proxmox.
// GET /api/v1/vms/status
func (h *VMHandler) GetStatuses(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	statuses := map[int]string(nil)
	if h.Notifier != nil {
		statuses = h.Notifier.Current()
	} else {
		vms, err := h.PX.GetVMs(c.Request.Context())
		if err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to fetch VM statuses", "fetch vm statuses", err)
			return
		}

		statuses = make(map[int]string, len(vms))
		for _, vm := range vms {
			statuses[vm.VMID] = vm.Status
		}
	}

	filtered, err := h.Authz.FilterVisibleStatuses(c.Request.Context(), principalID, statuses)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to authorize VM statuses", "filter visible vm statuses", err)
		return
	}

	c.JSON(http.StatusOK, filtered)
}

// GetResources returns cached resource metrics for a single VM.
// GET /api/v1/inventory/items/:id/vm/resources
func (h *VMHandler) GetResources(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	target, ok := requireVerifiedVMItemPermission(c, h.Authz, h.PX, principalID, itemID, authorization.View, false)
	if !ok {
		return
	}

	if h.Notifier == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "resource metrics unavailable"})
		return
	}

	resources, ok := h.Notifier.Resources(target.VMID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "no resource data available for this VM"})
		return
	}

	c.JSON(http.StatusOK, resources)
}
