package handlers

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var errPersonalPodTemplatesFolderUnavailable = errors.New("personal pod templates folder is not configured or does not resolve to a folder")
var errPersonalPodTemplateSourceOutOfScope = errors.New("source is not a direct template child of the configured personal pod templates folder")

// validatePersonalPodTemplateSource enforces that the source is a direct template child of the configured folder.
func validatePersonalPodTemplateSource(
	ctx context.Context,
	service configuredFolderReader,
	personalPodTemplatesFolderItemID uuid.UUID,
	sourceItemID uuid.UUID,
) error {
	folderID, found, err := resolveConfiguredFolderID(
		ctx, service, personalPodTemplatesFolderItemID, templatesFolderName,
	)
	if err != nil {
		return err
	}
	if !found {
		return errPersonalPodTemplatesFolderUnavailable
	}

	source, err := service.GetInventoryItemByID(ctx, sourceItemID)
	if err != nil {
		return err
	}
	if source.Kind != database.InventoryItemKindVm ||
		source.IsTemplate == nil || !*source.IsTemplate ||
		source.ParentID == nil || *source.ParentID != folderID {
		return errPersonalPodTemplateSourceOutOfScope
	}

	return nil
}

// VMNetworkScope is the server-derived network policy for a VM inside a pod folder.
type VMNetworkScope struct {
	Kind         database.PodNetworkAllocationKind
	VNet         string
	AllowedVNets []string
	VLANTag      int
}

// podNetworkScopeReader is the narrow seam to resolve the nearest pod network allocation; *database.Queries satisfies it.
type podNetworkScopeReader interface {
	GetPodNetworkScopeForInventoryItem(ctx context.Context, inventoryItemID uuid.UUID) (database.GetPodNetworkScopeForInventoryItemRow, error)
}

var _ podNetworkScopeReader = (*database.Queries)(nil)

func personalPodVNetScope(personalVNet string, networkNumber int32) VMNetworkScope {
	return VMNetworkScope{
		Kind:         database.PodNetworkAllocationKindPersonalPod,
		VNet:         personalVNet,
		AllowedVNets: []string{personalVNet},
		VLANTag:      int(networkNumber),
	}
}

// resolveVMNetworkScope derives scope from the nearest pod allocation ancestor of itemID; the client never supplies it.
func resolveVMNetworkScope(
	ctx context.Context,
	reader podNetworkScopeReader,
	catalog *podnetwork.Catalog,
	personalVNet string,
	itemID uuid.UUID,
) (scope VMNetworkScope, scoped bool, err error) {
	allocation, err := reader.GetPodNetworkScopeForInventoryItem(ctx, itemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return VMNetworkScope{}, false, nil
		}
		return VMNetworkScope{}, false, err
	}

	switch allocation.Kind {
	case database.PodNetworkAllocationKindPersonalPod:
		return personalPodVNetScope(personalVNet, allocation.NetworkNumber), true, nil

	case database.PodNetworkAllocationKindDevPod, database.PodNetworkAllocationKindPublishedClone:
		if allocation.NetworkProfileKey == nil || strings.TrimSpace(*allocation.NetworkProfileKey) == "" {
			return VMNetworkScope{}, false, fmt.Errorf(
				"pod network allocation for folder %s is missing a network profile", allocation.FolderID,
			)
		}
		profileKey := strings.TrimSpace(*allocation.NetworkProfileKey)

		profile, err := catalog.Profile(profileKey)
		if err != nil {
			return VMNetworkScope{}, false, fmt.Errorf("resolve pod network profile: %w", err)
		}

		defaultSegmentKey, err := catalog.DefaultWorkloadSegment(profileKey)
		if err != nil {
			return VMNetworkScope{}, false, fmt.Errorf("resolve pod default workload segment: %w", err)
		}
		defaultAttachment, err := catalog.ResolveWorkloadAttachment(profileKey, allocation.NetworkNumber, defaultSegmentKey)
		if err != nil {
			return VMNetworkScope{}, false, fmt.Errorf("resolve pod default workload attachment: %w", err)
		}
		if defaultAttachment.VMVLANTag == nil {
			return VMNetworkScope{}, false, fmt.Errorf(
				"pod default workload attachment for folder %s has no VLAN tag", allocation.FolderID,
			)
		}

		allowedVNets := make([]string, 0, len(profile.Segments))
		seen := make(map[string]struct{}, len(profile.Segments))
		for _, segment := range profile.Segments {
			if !segment.WorkloadAssignable {
				continue
			}
			vnetName, err := catalog.VNetName(segment.VNetKind)
			if err != nil {
				return VMNetworkScope{}, false, fmt.Errorf("resolve pod workload vnet: %w", err)
			}
			if _, ok := seen[vnetName]; ok {
				continue
			}
			seen[vnetName] = struct{}{}
			allowedVNets = append(allowedVNets, vnetName)
		}

		return VMNetworkScope{
			Kind:         allocation.Kind,
			VNet:         defaultAttachment.VNetName,
			AllowedVNets: allowedVNets,
			VLANTag:      *defaultAttachment.VMVLANTag,
		}, true, nil

	default:
		// manual_router is excluded by the generated query; reaching here means a new allocation kind needs handling.
		return VMNetworkScope{}, false, fmt.Errorf("unsupported pod network allocation kind %q", allocation.Kind)
	}
}

// isAllowedScopeBridge reports whether a trimmed bridge is one of scope's workload-assignable VNets.
func isAllowedScopeBridge(scope VMNetworkScope, bridge string) bool {
	bridge = strings.TrimSpace(bridge)
	for _, allowed := range scope.AllowedVNets {
		if bridge == allowed {
			return true
		}
	}
	return false
}

// normalizeScopedCreationNetwork always overwrites the VLAN tag to the allocation tag regardless of what was requested.
func normalizeScopedCreationNetwork(scope VMNetworkScope, bridge string) (normalizedBridge string, normalizedTag int, ok bool) {
	bridge = strings.TrimSpace(bridge)
	switch {
	case bridge == "":
		return scope.VNet, scope.VLANTag, true
	case isAllowedScopeBridge(scope, bridge):
		return bridge, scope.VLANTag, true
	default:
		return "", 0, false
	}
}

// chooseScopedCloneBridge preserves an allowed source bridge, otherwise the scope default applies.
func chooseScopedCloneBridge(scope VMNetworkScope, sourceBridge string) string {
	if isAllowedScopeBridge(scope, sourceBridge) {
		return strings.TrimSpace(sourceBridge)
	}
	return scope.VNet
}
