package handlers

import (
	"context"
	"errors"
	"log"
	"slices"
	"sort"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	podsFolderName                 = "Pods"
	templatesFolderName            = "Templates"
	podVirtualMachinesFolderName   = "a0-Virtual-Machines"
	publishedPodTemplateFolderName = "a1-Templates"
)

var errConfiguredPodsFolderMissing = errors.New("configured PODS_FOLDER_ITEM_ID does not resolve to an existing folder")
var errConfiguredPersonalPodsFolderMissing = errors.New("configured PERSONAL_PODS_FOLDER_ITEM_ID does not resolve to an existing folder")

// resolveTemplatesFolderID prefers the configured TEMPLATES_FOLDER_ITEM_ID and
// falls back to matching the "Templates" folder by name under the root.
func (h *PodsHandler) resolveTemplatesFolderID(ctx context.Context) (uuid.UUID, bool, error) {
	return h.resolveConfiguredFolderID(ctx, h.TemplatesFolderItemID, templatesFolderName)
}

func (h *PodsHandler) resolvePodsFolderID(ctx context.Context) (uuid.UUID, bool, error) {
	return h.resolveConfiguredFolderID(ctx, h.PodsFolderItemID, podsFolderName)
}

func (h *PodsHandler) resolvePersonalPodsFolderID(ctx context.Context) (uuid.UUID, bool, error) {
	return h.resolveConfiguredFolderID(ctx, h.PersonalPodsFolderItemID, personalPodsFolderName)
}

func (h *PodsHandler) resolveConfiguredFolderID(
	ctx context.Context,
	configuredID uuid.UUID,
	fallbackName string,
) (uuid.UUID, bool, error) {
	if configuredID == uuid.Nil {
		return h.Service.FindFolderPath(ctx, []string{fallbackName})
	}

	item, err := h.Service.GetInventoryItemByID(ctx, configuredID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, err
	}
	if item.Kind != database.InventoryItemKindFolder {
		return uuid.Nil, false, nil
	}
	return item.ID, true, nil
}

// ensurePodsFolderID is used by pod creation, which must end up with a
// concrete Pods folder. With a configured ID the folder must already exist.
func (h *PodsHandler) ensurePodsFolderID(ctx context.Context) (uuid.UUID, error) {
	if h.PodsFolderItemID == uuid.Nil {
		return h.Service.EnsureFolderPathWithDescription(ctx, []string{podsFolderName}, new(inventory.PurposePodsFolderDescription))
	}

	id, found, err := h.resolvePodsFolderID(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	if !found {
		return uuid.Nil, errConfiguredPodsFolderMissing
	}
	if err := h.Service.SetFolderDescription(ctx, id, inventory.PurposePodsFolderDescription); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (h *PodsHandler) ensurePersonalPodsFolderID(ctx context.Context) (uuid.UUID, error) {
	if h.PersonalPodsFolderItemID == uuid.Nil {
		return h.Service.EnsureFolderPathWithDescription(ctx, []string{personalPodsFolderName}, new(inventory.PurposePersonalPodsFolderDescription))
	}

	id, found, err := h.resolvePersonalPodsFolderID(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	if !found {
		return uuid.Nil, errConfiguredPersonalPodsFolderMissing
	}
	if err := h.Service.SetFolderDescription(ctx, id, inventory.PurposePersonalPodsFolderDescription); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (h *PodsHandler) EnsurePurposeFolderDescriptions(ctx context.Context) error {
	syncDescription := func(label string, sync func() error) {
		if err := sync(); err != nil {
			log.Printf("Purpose folder description sync for %q failed: %v", label, err)
		}
	}

	rows, err := database.New(h.DB).GetAllInventoryItems(ctx)
	if err != nil {
		return err
	}
	if rootID := proxmox.FindManagedRootFolderID(rows); rootID != nil {
		syncDescription(proxmox.RootFolderName, func() error {
			return h.Service.SetFolderDescription(ctx, *rootID, inventory.PurposeProxmoxRootFolderDescription)
		})
	}

	syncDescription(podsFolderName, func() error {
		if h.PodsFolderItemID != uuid.Nil {
			id, found, err := h.resolvePodsFolderID(ctx)
			if err != nil || !found {
				return err
			}
			return h.Service.SetFolderDescription(ctx, id, inventory.PurposePodsFolderDescription)
		}
		id, found, err := h.Service.FindFolderPath(ctx, []string{podsFolderName})
		if err != nil || !found {
			return err
		}
		return h.Service.SetFolderDescription(ctx, id, inventory.PurposePodsFolderDescription)
	})

	syncDescription(personalPodsFolderName, func() error {
		if h.PersonalPodsFolderItemID != uuid.Nil {
			id, found, err := h.resolvePersonalPodsFolderID(ctx)
			if err != nil || !found {
				return err
			}
			return h.Service.SetFolderDescription(ctx, id, inventory.PurposePersonalPodsFolderDescription)
		}
		id, found, err := h.Service.FindFolderPath(ctx, []string{personalPodsFolderName})
		if err != nil || !found {
			return err
		}
		return h.Service.SetFolderDescription(ctx, id, inventory.PurposePersonalPodsFolderDescription)
	})

	syncDescription(templatesFolderName, func() error {
		id, found, err := h.resolveTemplatesFolderID(ctx)
		if err != nil || !found {
			return err
		}
		return h.Service.SetFolderDescription(ctx, id, inventory.PurposeTemplatesFolderDescription)
	})

	return nil
}

func (h *PodsHandler) publishPodFolders(
	ctx context.Context,
	principalID uuid.UUID,
	publishedPodID uuid.UUID,
) ([]publishPodFolderOption, error) {
	podsFolderID, found, err := h.resolvePodsFolderID(ctx)
	if err != nil {
		return nil, err
	}
	if !found {
		return []publishPodFolderOption{}, nil
	}

	rows, err := h.Service.GetVisibleInventoryItems(ctx, principalID)
	if err != nil {
		return nil, err
	}

	publishedRows, err := database.New(h.DB).ListPublishedPods(ctx)
	if err != nil {
		return nil, err
	}
	publishedPodFolderIDs := make(map[uuid.UUID]struct{}, len(publishedRows))
	for _, row := range publishedRows {
		if row.ID == publishedPodID {
			continue
		}
		publishedPodFolderIDs[row.SourceFolderID] = struct{}{}
	}

	return buildPublishPodFolderOptions(rows, podsFolderID, publishedPodFolderIDs, h.loadPublishFolderNetworkMetadata(ctx, rows, podsFolderID)), nil
}

func (h *PodsHandler) loadPublishFolderNetworkMetadata(
	ctx context.Context,
	rows []database.GetVisibleInventoryItemsForPrincipalRow,
	podsFolderID uuid.UUID,
) map[uuid.UUID]publishFolderNetworkMetadata {
	result := make(map[uuid.UUID]publishFolderNetworkMetadata)
	for _, row := range rows {
		if row.Kind != database.InventoryItemKindFolder || row.ParentID == nil || *row.ParentID != podsFolderID {
			continue
		}
		topology, err := h.loadDevNetworkTopology(ctx, row.ID)
		if err != nil {
			continue
		}
		assignments := make(map[uuid.UUID]publishNetworkAssignment, len(topology.Assignments))
		for _, assignment := range topology.Assignments {
			assignments[assignment.InventoryItemID] = publishNetworkAssignment{
				IsRouter:   assignment.IsRouter,
				SegmentKey: assignment.SegmentKey,
			}
		}
		result[row.ID] = publishFolderNetworkMetadata{
			ProfileKey:  topology.ProfileKey,
			Assignments: assignments,
		}
	}
	return result
}

type publishFolderNetworkMetadata struct {
	ProfileKey  string
	Assignments map[uuid.UUID]publishNetworkAssignment
}

func buildPublishPodFolderOptions(
	rows []database.GetVisibleInventoryItemsForPrincipalRow,
	podsFolderID uuid.UUID,
	publishedPodFolderIDs map[uuid.UUID]struct{},
	networkMetadata map[uuid.UUID]publishFolderNetworkMetadata,
) []publishPodFolderOption {
	rowsByID := make(map[uuid.UUID]database.GetVisibleInventoryItemsForPrincipalRow, len(rows))
	for _, row := range rows {
		rowsByID[row.ID] = row
	}

	folders := make(map[uuid.UUID]*publishPodFolderOption, len(rows))
	for _, row := range rows {
		if row.Kind != database.InventoryItemKindFolder {
			continue
		}
		if row.ParentID == nil || *row.ParentID != podsFolderID {
			continue
		}
		if _, published := publishedPodFolderIDs[row.ID]; published {
			continue
		}
		metadata, ok := networkMetadata[row.ID]
		if !ok {
			continue
		}
		if !maskHas(row.AllowedMask, authorization.View) {
			continue
		}
		folders[row.ID] = &publishPodFolderOption{
			ID:                row.ID,
			Name:              row.Name,
			Path:              inventoryPath(row.ID, rowsByID),
			NetworkProfileKey: metadata.ProfileKey,
		}
	}

	vmFolderToPodRoot := make(map[uuid.UUID]uuid.UUID)
	for _, row := range rows {
		if row.Kind != database.InventoryItemKindFolder {
			continue
		}
		if row.Name != podVirtualMachinesFolderName {
			continue
		}
		if row.ParentID == nil {
			continue
		}
		if _, ok := folders[*row.ParentID]; !ok {
			continue
		}
		vmFolderToPodRoot[row.ID] = *row.ParentID
	}

	for _, row := range rows {
		if row.Kind != database.InventoryItemKindVm || row.ParentID == nil {
			continue
		}
		if row.IsTemplate != nil && *row.IsTemplate {
			continue
		}
		if !maskHas(row.AllowedMask, authorization.View) {
			continue
		}

		podRootID, ok := vmFolderToPodRoot[*row.ParentID]
		if !ok {
			continue
		}
		folder := folders[podRootID]
		if folder == nil {
			continue
		}
		metadata := networkMetadata[podRootID]
		assignment, hasAssignment := metadata.Assignments[row.ID]
		folder.VirtualMachines = append(folder.VirtualMachines, publishPodVMOption{
			ID:        row.ID,
			Name:      row.Name,
			GuestType: guestTypeFromRow(row.GuestType),
			CPUCount:  positiveHardwareInt(row.CpuCount),
			MemoryGB:  memoryMBToGB(row.MemoryMb),
			StorageGB: diskGBToInt(row.DiskGb),
			IsRouter:  hasAssignment && assignment.IsRouter,
			SegmentKey: func() *string {
				if !hasAssignment || assignment.IsRouter {
					return nil
				}
				return assignment.SegmentKey
			}(),
			Permissions: publishedPodPermissionResponse{
				AllowMask: defaultPublishedPodVMAllowMask,
				DenyMask:  0,
			},
		})
	}

	options := make([]publishPodFolderOption, 0, len(folders))
	for _, folder := range folders {
		if len(folder.VirtualMachines) == 0 {
			continue
		}
		options = append(options, *folder)
	}
	sort.SliceStable(options, func(i, j int) bool {
		left := strings.ToLower(options[i].Path)
		right := strings.ToLower(options[j].Path)
		if left != right {
			return left < right
		}
		return options[i].Path < options[j].Path
	})

	return options
}

func guestTypeFromRow(value *string) string {
	if value != nil && *value != "" {
		return *value
	}
	return "qemu"
}

func findPodFolder(
	folders []publishPodFolderOption,
	folderID uuid.UUID,
) (publishPodFolderOption, bool) {
	index := slices.IndexFunc(folders, func(folder publishPodFolderOption) bool {
		return folder.ID == folderID
	})
	if index < 0 {
		return publishPodFolderOption{}, false
	}
	return folders[index], true
}

func inventoryPath(
	id uuid.UUID,
	rowsByID map[uuid.UUID]database.GetVisibleInventoryItemsForPrincipalRow,
) string {
	parts := make([]string, 0, 4)
	for currentID := id; currentID != uuid.Nil; {
		row, ok := rowsByID[currentID]
		if !ok {
			break
		}
		parts = append(parts, row.Name)
		if row.ParentID == nil {
			break
		}
		currentID = *row.ParentID
	}
	slices.Reverse(parts)
	return strings.Join(parts, " / ")
}
