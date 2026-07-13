package handlers

import (
	"context"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type vmCreateProxmox interface {
	GetNodes(ctx context.Context) ([]proxmox.Node, error)
	ResolvePrimaryNode(ctx context.Context) (proxmox.Node, error)
	GetCreateStorages(ctx context.Context, node string) (diskStorages []proxmox.Storage, isoStorages []proxmox.Storage, err error)
	GetCreateNetworks(ctx context.Context, node string) (bridges []proxmox.NetworkBridge, vnets []proxmox.VNet, err error)
	GetStorages(ctx context.Context, node string) ([]proxmox.Storage, error)
	IsSharedStorage(storage proxmox.Storage) bool
	IsExcludedStorage(storage proxmox.Storage) bool
	GetISOs(ctx context.Context, node, storage string) ([]proxmox.ISOContent, error)
	GetCreateISOs(ctx context.Context, node, storage string) ([]proxmox.ISOContent, error)
	GetNextVMID(ctx context.Context) (int, error)
	IsVMIDAvailable(ctx context.Context, vmid int) (bool, error)
	GetBridges(ctx context.Context, node string) ([]proxmox.NetworkBridge, error)
	GetVNets(ctx context.Context) ([]proxmox.VNet, error)
	GetOptimalNode(ctx context.Context) (proxmox.Node, error)
	CreateVM(ctx context.Context, node string, params map[string]string) error
	SyncVMPoolMembership(ctx context.Context, node string, vmid int, desiredPool string, path []string) error
	DeleteVM(ctx context.Context, gt proxmox.GuestType, node string, vmid int) error
	GetClusterUsageHistory(ctx context.Context, timeframe string) (proxmox.ClusterUsageHistory, error)
}

type vmCreateAuthz interface {
	vmAuthz
	HasAny(ctx context.Context, principalID uuid.UUID, required authorization.Mask) (bool, error)
	RequireManagement(ctx context.Context, principalID uuid.UUID, required authorization.ManagementPermission) error
}

// VMCreateHandler handles VM creation and related metadata endpoints.
type VMCreateHandler struct {
	PX                    vmCreateProxmox
	DB                    *pgxpool.Pool
	Importer              *proxmox.InventoryImporter
	Service               *inventory.Service
	Authz                 vmCreateAuthz
	Audit                 *audit.Service
	Allocator             *vmidalloc.Allocator
	PersonalPodVNetPrefix string
	PodLANVLANBase        int
}

// GetNodes returns all cluster nodes.
// GET /api/v1/proxmox/nodes
func (h *VMCreateHandler) GetNodes(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireVMCreateMetadataAccess(c, h.Authz, principalID) {
		return
	}

	nodes, err := h.PX.GetNodes(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch nodes", "fetch proxmox nodes", err)
		return
	}
	c.JSON(http.StatusOK, nodes)
}

type createOptionsResponse struct {
	Nodes        []proxmox.Node          `json:"nodes"`
	DiskStorages []proxmox.Storage       `json:"disk_storages"`
	ISOStorages  []proxmox.Storage       `json:"iso_storages"`
	Bridges      []proxmox.NetworkBridge `json:"bridges"`
	VNets        []proxmox.VNet          `json:"vnets"`
}

func filterVNetsByName(vnets []proxmox.VNet, scopedVNetName string) []proxmox.VNet {
	scopedVNets := make([]proxmox.VNet, 0, 1)
	for _, vnet := range vnets {
		if vnet.VNet == scopedVNetName {
			scopedVNets = append(scopedVNets, vnet)
		}
	}

	return scopedVNets
}

// GetCreateOptions returns VM create options sourced from the configured
// metadata node plus cluster-level VNets.
// GET /api/v1/proxmox/create/options
func (h *VMCreateHandler) GetCreateOptions(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}
	if !requireVMCreateMetadataAccess(c, h.Authz, principalID) {
		return
	}

	scopeItemIDValue := strings.TrimSpace(c.Query("scope_item_id"))
	scopeItemID := uuid.Nil
	if scopeItemIDValue != "" {
		parsedItemID, err := uuid.Parse(scopeItemIDValue)
		if err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "invalid scope_item_id"})
			return
		}
		scopeItemID = parsedItemID
	}

	nodes, err := h.PX.GetNodes(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch nodes", "fetch create options nodes", err)
		return
	}

	createOptionsNode, err := h.PX.ResolvePrimaryNode(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to resolve primary node", "resolve primary node", err)
		return
	}

	diskStorages, isoStorages, err := h.PX.GetCreateStorages(
		c.Request.Context(),
		createOptionsNode.Node,
	)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch storages", "fetch create option storages", err)
		return
	}

	bridges, vnets, err := h.PX.GetCreateNetworks(
		c.Request.Context(),
		createOptionsNode.Node,
	)
	if err != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch networks", "fetch create option networks", err)
		return
	}

	if scopeItemID != uuid.Nil {
		isManager, err := h.Authz.IsManager(c.Request.Context(), principalID)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to determine management permissions", "check vm create options management permission", err)
			return
		}
		if !isManager {
			scopedVNetName, scoped, err := personalPodNetworkScope(
				c.Request.Context(),
				h.DB,
				h.PersonalPodVNetPrefix,
				h.PodLANVLANBase,
				scopeItemID,
			)
			if err != nil {
				writeLoggedError(c, http.StatusInternalServerError, "failed to determine personal pod network scope", "resolve vm create options network scope", err)
				return
			}
			if scoped {
				bridges = []proxmox.NetworkBridge{}
				vnets = filterVNetsByName(vnets, scopedVNetName)
			}
		}
	}

	c.JSON(http.StatusOK, createOptionsResponse{
		Nodes:        nodes,
		DiskStorages: diskStorages,
		ISOStorages:  isoStorages,
		Bridges:      bridges,
		VNets:        vnets,
	})
}
