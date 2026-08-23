package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
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
	Importer              *proxmox.InventoryImporter
	Service               *inventory.Service
	Authz                 vmCreateAuthz
	Audit                 *audit.Service
	Allocator             *vmidalloc.Allocator
	TemplatesFolderItemID uuid.UUID
	TemplateLibrary       templateLibraryReader
	NetworkScopeReader    podNetworkScopeReader
	NetworkCatalog        *podnetwork.Catalog
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

// scopedNetworkResponse is authoritative display data only; the server enforces the same policy independently on mutation.
type scopedNetworkResponse struct {
	Bridge         string   `json:"bridge"`
	AllowedBridges []string `json:"allowed_bridges"`
	VLANTag        int      `json:"vlan_tag"`
}

func scopedNetworkResponseFromScope(scope VMNetworkScope) *scopedNetworkResponse {
	return &scopedNetworkResponse{
		Bridge:         scope.VNet,
		AllowedBridges: scope.AllowedVNets,
		VLANTag:        scope.VLANTag,
	}
}

type createOptionsResponse struct {
	Nodes         []proxmox.Node          `json:"nodes"`
	DiskStorages  []proxmox.Storage       `json:"disk_storages"`
	ISOStorages   []proxmox.Storage       `json:"iso_storages"`
	Bridges       []proxmox.NetworkBridge `json:"bridges"`
	VNets         []proxmox.VNet          `json:"vnets"`
	ScopedNetwork *scopedNetworkResponse  `json:"scoped_network,omitempty"`
	Templates     []templateLibraryOption `json:"templates"`
}

// filterVNetsByName keeps only the VNet named scopedVNetName, preserving Proxmox response order.
func filterVNetsByName(vnets []proxmox.VNet, scopedVNetName string) []proxmox.VNet {
	return filterVNetsByNames(vnets, []string{scopedVNetName})
}

// filterVNetsByNames keeps only the VNets whose name is in allowedVNetNames, preserving Proxmox response order.
func filterVNetsByNames(vnets []proxmox.VNet, allowedVNetNames []string) []proxmox.VNet {
	allowed := make(map[string]struct{}, len(allowedVNetNames))
	for _, name := range allowedVNetNames {
		allowed[name] = struct{}{}
	}

	filtered := make([]proxmox.VNet, 0, len(allowedVNetNames))
	for _, vnet := range vnets {
		if _, ok := allowed[vnet.VNet]; ok {
			filtered = append(filtered, vnet)
		}
	}

	return filtered
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
	if len(nodes) == 0 {
		writeLoggedError(c, http.StatusBadGateway, "failed to resolve primary node", "resolve primary node", fmt.Errorf("no managed cluster nodes available"))
		return
	}
	createOptionsNode := nodes[0]

	var (
		diskStorages []proxmox.Storage
		isoStorages  []proxmox.Storage
		storagesErr  error
		bridges      []proxmox.NetworkBridge
		vnets        []proxmox.VNet
		networksErr  error
	)

	group := new(errgroup.Group)
	group.Go(func() error {
		diskStorages, isoStorages, storagesErr = h.PX.GetCreateStorages(
			c.Request.Context(),
			createOptionsNode.Node,
		)
		return nil
	})
	group.Go(func() error {
		bridges, vnets, networksErr = h.PX.GetCreateNetworks(
			c.Request.Context(),
			createOptionsNode.Node,
		)
		return nil
	})
	_ = group.Wait()

	if storagesErr != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch storages", "fetch create option storages", storagesErr)
		return
	}
	if networksErr != nil {
		writeLoggedError(c, http.StatusBadGateway, "failed to fetch networks", "fetch create option networks", networksErr)
		return
	}

	var scopedNetwork *scopedNetworkResponse
	if scopeItemID != uuid.Nil {
		scope, scoped, err := resolveVMNetworkScope(
			c.Request.Context(), h.NetworkScopeReader, h.NetworkCatalog, scopeItemID,
		)
		if err != nil {
			writeLoggedError(c, http.StatusInternalServerError, "failed to determine pod network scope", "resolve vm create options network scope", err)
			return
		}
		if scoped {
			bridges = []proxmox.NetworkBridge{}
			vnets = filterVNetsByNames(vnets, scope.AllowedVNets)
			scopedNetwork = scopedNetworkResponseFromScope(scope)
		}
	}

	templates, err := loadTemplateLibraryOptions(
		c.Request.Context(), h.TemplateLibrary, h.TemplatesFolderItemID,
	)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to load VM creation options", "load VM template options", err)
		return
	}

	c.JSON(http.StatusOK, createOptionsResponse{
		Nodes:         nodes,
		DiskStorages:  diskStorages,
		ISOStorages:   isoStorages,
		Bridges:       bridges,
		VNets:         vnets,
		ScopedNetwork: scopedNetwork,
		Templates:     templates,
	})
}
