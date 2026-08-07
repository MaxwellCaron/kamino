package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type cloneVMRequest struct {
	NewID          int    `json:"newid"`
	Name           string `json:"name" binding:"required"`
	Full           bool   `json:"full"`
	Target         string `json:"target"`
	TargetFolderID string `json:"target_folder_id" binding:"required"`
}

type vmMutationResponse struct {
	OK     bool          `json:"ok"`
	VMID   int           `json:"vmid"`
	ItemID uuid.UUID     `json:"item_id"`
	Item   InventoryItem `json:"item"`
}

func resolveVMCloneSource(
	ctx context.Context,
	authzService vmAuthz,
	px vmProxmox,
	templateLibrary configuredFolderReader,
	configuredFolderID uuid.UUID,
	principalID uuid.UUID,
	itemID uuid.UUID,
) (verifiedVMTarget, *requestError) {
	err := validateTemplateLibrarySource(ctx, templateLibrary, configuredFolderID, itemID)
	switch err {
	case nil:
		return resolveVerifiedVMItem(ctx, authzService, px, itemID, true)
	case errTemplateLibraryUnavailable, errTemplateSourceOutOfScope:
	default:
		return verifiedVMTarget{}, &requestError{
			Status:      http.StatusInternalServerError,
			UserMessage: "failed to validate template source",
			Operation:   "validate configured VM template source",
			Err:         err,
		}
	}

	return resolveVerifiedVMItemPermission(
		ctx, authzService, px, principalID, itemID, authorization.CloneVM, true,
	)
}

// CloneVM clones a VM and waits for the Proxmox task to complete.
// POST /api/v1/inventory/items/:id/vm/clone
func (h *VMHandler) CloneVM(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	var req cloneVMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}
	req.Name = names.Normalize(req.Name)
	if err := names.ValidateVM(req.Name); err != nil {
		writeLoggedError(c, http.StatusUnprocessableEntity, err.Error(), "validate vm name", err)
		return
	}
	itemID, ok := parseItemIDParam(c)
	if !ok {
		return
	}
	source, reqErr := resolveVMCloneSource(
		c.Request.Context(), h.Authz, h.PX, h.TemplateLibrary, h.TemplatesFolderItemID, principalID, itemID,
	)
	if reqErr != nil {
		writeRequestError(c, reqErr)
		return
	}
	if source.GuestType == proxmox.GuestLXC {
		writeContainerNotSupported(c)
		return
	}

	targetFolderID, err := uuid.Parse(req.TargetFolderID)
	if err != nil {
		writeInvalidRequest(c, "invalid target_folder_id")
		return
	}
	if !requireInventoryPermission(c, h.Authz, principalID, targetFolderID, authorization.CreateVM) {
		return
	}

	// Resolve destination scope up front for every caller so a zero-NIC template is rejected before any Proxmox mutation.
	var (
		networkScope   VMNetworkScope
		scopedToFolder bool
		sourceNetworks []proxmox.VMHardwareNetwork
	)
	scope, scoped, err := resolveVMNetworkScope(
		c.Request.Context(), h.NetworkScopeReader, h.NetworkCatalog, targetFolderID,
	)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to determine pod network scope", "resolve vm clone network scope", err)
		return
	}
	if scoped {
		sourceHardware, err := h.PX.GetVMHardwareConfig(c.Request.Context(), source.Node, source.VMID)
		if err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to load source virtual machine hardware", "load vm clone source hardware config", err)
			return
		}
		if len(sourceHardware.Networks) == 0 {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error": "templates cloned into this pod must have at least one network interface",
			})
			return
		}
		networkScope = scope
		sourceNetworks = sourceHardware.Networks
		scopedToFolder = true
	}

	placement, err := h.Service.ResolveFolderPlacement(c.Request.Context(), targetFolderID)
	if err != nil {
		writeInventoryError(c, err)
		return
	}
	reservation, err := h.Service.ReserveFolderVMCapacity(c.Request.Context(), targetFolderID, 1, "vm_clone")
	if err != nil {
		writeInventoryError(c, err)
		return
	}
	if reservation != nil {
		defer reservation.Release(c.Request.Context())
	}

	targetNode := strings.TrimSpace(req.Target)
	if targetNode == "" {
		optimalNode, err := h.PX.GetOptimalNode(c.Request.Context())
		if err != nil {
			writeLoggedError(c, http.StatusBadGateway, "failed to resolve optimal node", "resolve optimal node", err)
			return
		}
		targetNode = optimalNode.Node
	}

	// The source VM is the inventory item being mutated for the duration of
	// the clone (Proxmox reads its disks/config); claim it so a concurrent
	// rename/delete/power action on the source cannot interleave.
	acquireOp := func(context.Context) (func(), error) { return func() {}, nil }
	if h.Actions != nil {
		acquireOp = h.Actions.AcquireOperationSlot
	}
	runCloneWithOperationSlot(c, acquireOp, func() bool {
		return h.runClaimedVMAction(c, source.ItemID, "clone_vm", principalID, func() bool {
			newID, err := runWithAvailableVMID(c.Request.Context(), h.Allocator, req.NewID, func(vmid int) error {
				return h.PX.CloneVM(c.Request.Context(), source.Node, source.VMID, vmid, req.Name, req.Full, targetNode)
			})
			switch {
			case err == nil:
			case isVMIDUnavailable(err):
				writeConflict(c, "VM ID is already in use")
				return false
			default:
				writeLoggedError(c, http.StatusBadGateway, "failed to clone VM", "clone proxmox vm", err)
				return false
			}

			if err := h.PX.SetVMUpstreamUUID(c.Request.Context(), targetNode, newID, uuid.New()); err != nil {
				cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, newID, "cloned VM identity failure")
				writeLoggedError(c, http.StatusBadGateway, "failed to assign clone identity", "assign cloned vm upstream uuid", err)
				return false
			}

			if err := h.PX.SyncVMPoolMembership(c.Request.Context(), targetNode, newID, placement.PoolID, placement.Path); err != nil {
				cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, newID, "cloned VM pool sync failure")
				writeLoggedError(c, http.StatusBadGateway, "failed to sync VM pool membership", "sync cloned vm pool membership", err)
				return false
			}

			if scopedToFolder {
				rewrites := buildScopedCloneNetworkRewrites(networkScope, sourceNetworks)
				for _, rewrite := range rewrites {
					vlanTag := rewrite.VLANTag
					if err := h.PX.SetVMNetworkAttachment(c.Request.Context(), targetNode, newID, rewrite.Device, proxmox.NetworkAttachment{
						Bridge:   rewrite.Bridge,
						VLANTag:  &vlanTag,
						LinkDown: rewrite.LinkDown,
						Firewall: rewrite.Firewall,
					}); err != nil {
						cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, newID, "cloned VM network scope failure")
						writeLoggedError(c, http.StatusBadGateway, "failed to scope cloned VM network to its pod", "set cloned vm network scope", err)
						return false
					}
				}

				clonedHardware, err := h.PX.GetVMHardwareConfig(c.Request.Context(), targetNode, newID)
				if err != nil {
					cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, newID, "cloned VM network scope verification failure")
					writeLoggedError(c, http.StatusBadGateway, "failed to verify cloned VM network scope", "verify cloned vm network scope", err)
					return false
				}
				if err := verifyScopedCloneNetworks(rewrites, clonedHardware.Networks); err != nil {
					cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, newID, "cloned VM network scope mismatch")
					writeLoggedError(c, http.StatusBadGateway, "cloned VM network did not verify against its pod scope", "verify cloned vm network scope", err)
					return false
				}
			}

			clonedItemID, err := h.Importer.SyncVM(
				c.Request.Context(),
				placement.FolderID,
				targetNode,
				newID,
				proxmox.GuestQEMU,
			)
			if err != nil {
				cleanupProxmoxVM(c.Request.Context(), h.PX, targetNode, newID, "cloned VM inventory sync failure")
				writeLoggedError(c, http.StatusInternalServerError, "vm cloned in Proxmox but failed to sync inventory metadata", "sync cloned vm inventory metadata", err)
				return false
			}

			h.Service.NotifyInventoryChanged(c.Request.Context(), clonedItemID)

			item, err := h.Service.GetInventoryItemWithPermissions(
				c.Request.Context(),
				principalID,
				clonedItemID,
			)
			if err != nil {
				writeLoggedError(c, http.StatusInternalServerError, "vm cloned in Proxmox but failed to load inventory item", "load cloned vm inventory item", err)
				return false
			}

			c.JSON(http.StatusOK, vmMutationResponse{
				OK:     true,
				VMID:   newID,
				ItemID: clonedItemID,
				Item:   buildInventoryItem(item),
			})
			h.Audit.RecordSuccess(c.Request.Context(), audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "vm.clone",
				TargetKind:       "vm",
				InventoryItemID:  &source.ItemID,
				Metadata:         map[string]any{"new_vmid": newID, "cloned_item_id": clonedItemID.String()},
			})
			return true
		})
	})
}

// scopedCloneNetworkRewrite is the target bridge/tag/flags one cloned NIC must carry.
type scopedCloneNetworkRewrite struct {
	Device   string
	Bridge   string
	VLANTag  int
	Firewall bool
	LinkDown bool
}

// buildScopedCloneNetworkRewrites preserves an allowed source bridge, otherwise defaults, and always sets the allocation tag.
func buildScopedCloneNetworkRewrites(scope VMNetworkScope, sourceNetworks []proxmox.VMHardwareNetwork) []scopedCloneNetworkRewrite {
	rewrites := make([]scopedCloneNetworkRewrite, 0, len(sourceNetworks))
	for _, network := range sourceNetworks {
		rewrites = append(rewrites, scopedCloneNetworkRewrite{
			Device:   network.Device,
			Bridge:   chooseScopedCloneBridge(scope, network.Bridge),
			VLANTag:  scope.VLANTag,
			Firewall: network.Firewall,
			LinkDown: network.LinkDown,
		})
	}
	return rewrites
}

// verifyScopedCloneNetworks confirms a fresh hardware read matches every expected rewrite exactly.
func verifyScopedCloneNetworks(rewrites []scopedCloneNetworkRewrite, clonedNetworks []proxmox.VMHardwareNetwork) error {
	if len(clonedNetworks) != len(rewrites) {
		return fmt.Errorf("cloned VM has %d network device(s), want %d", len(clonedNetworks), len(rewrites))
	}

	cloned := make(map[string]proxmox.VMHardwareNetwork, len(clonedNetworks))
	for _, network := range clonedNetworks {
		cloned[network.Device] = network
	}

	for _, rewrite := range rewrites {
		network, ok := cloned[rewrite.Device]
		if !ok {
			return fmt.Errorf("cloned VM is missing expected network device %s", rewrite.Device)
		}
		if network.Bridge != rewrite.Bridge {
			return fmt.Errorf("cloned VM device %s bridge = %q, want %q", rewrite.Device, network.Bridge, rewrite.Bridge)
		}
		if network.VLANTag == nil || *network.VLANTag != rewrite.VLANTag {
			return fmt.Errorf("cloned VM device %s VLAN tag mismatch, want %d", rewrite.Device, rewrite.VLANTag)
		}
	}

	return nil
}

func runCloneWithOperationSlot(
	c *gin.Context,
	acquire func(context.Context) (func(), error),
	fn func() bool,
) bool {
	release, err := acquire(c.Request.Context())
	if err != nil {
		logRequestError(c, "acquire vm operation slot", err)
		writeLoggedError(c, http.StatusServiceUnavailable, "VM operations are busy", "acquire vm operation slot", err)
		return false
	}
	defer release()
	return fn()
}

// ConvertToTemplate converts one or more VMs to templates.
// POST /api/v1/inventory/vms/template
func (h *VMHandler) ConvertToTemplate(c *gin.Context) {
	principalID, ok := currentPrincipalID(c)
	if !ok {
		writeUnauthorized(c)
		return
	}

	var req bulkVMItemsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "invalid request body")
		return
	}

	itemIDs, err := parseBulkVMItemIDs(req.ItemIDs)
	if err != nil {
		writeInvalidRequest(c, "invalid id")
		return
	}

	targets, response := h.collectVerifiedVMTargets(
		c,
		principalID,
		itemIDs,
		authorization.TemplateVM,
		true,
		false,
	)

	ctx := c.Request.Context()
	operationLimit := 2
	acquireOp := func(context.Context) (func(), error) { return func() {}, nil }
	if h.Actions != nil {
		operationLimit = h.Actions.OperationConcurrency()
		acquireOp = h.Actions.AcquireOperationSlot
	}
	outcomes := runBoundedVMTemplateConversions(
		ctx,
		operationLimit,
		targets,
		acquireOp,
		func(ctx context.Context, target verifiedVMTarget) (bool, bool, error) {
			inventorySyncFailed := false
			actionErr, claimed := h.runClaimedBulkVMAction(ctx, target, "convert_to_template", principalID, func() error {
				if err := h.PX.ConvertToTemplate(ctx, target.Node, target.VMID); err != nil {
					return err
				}
				if err := h.Service.UpdateInventoryVMIsTemplate(ctx, target.ItemID); err != nil {
					inventorySyncFailed = true
					return err
				}
				return nil
			})
			return claimed, inventorySyncFailed, actionErr
		},
	)

	for _, outcome := range outcomes {
		target := outcome.target
		if outcome.unsupported {
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: "not supported for containers",
			})
			continue
		}
		if !outcome.admitted {
			logRequestError(c, "acquire vm operation slot item_id="+target.ItemID.String(), outcome.err)
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: "templatize failed",
			})
			continue
		}
		if !outcome.claimed {
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: "another action is already in progress for this VM",
			})
			continue
		}
		if outcome.err != nil {
			errMessage := "templatize failed"
			operation := "convert vm to template"
			if outcome.inventorySyncFailed {
				errMessage = "inventory sync failed"
				operation = "update vm template state in inventory"
			}
			logRequestError(c, operation+" item_id="+target.ItemID.String(), outcome.err)
			h.Audit.RecordFailure(ctx, audit.EventParams{
				ActorPrincipalID: &principalID,
				ActionKind:       "vm.template",
				TargetKind:       "vm",
				InventoryItemID:  &target.ItemID,
			}, errMessage)
			response.Failed = append(response.Failed, bulkVMActionFailure{
				ID:    target.ItemID.String(),
				Error: errMessage,
			})
			continue
		}

		h.Audit.RecordSuccess(ctx, audit.EventParams{
			ActorPrincipalID: &principalID,
			ActionKind:       "vm.template",
			TargetKind:       "vm",
			InventoryItemID:  &target.ItemID,
		})
		response.Succeeded = append(response.Succeeded, target.ItemID.String())
	}

	c.JSON(http.StatusOK, response)
}
