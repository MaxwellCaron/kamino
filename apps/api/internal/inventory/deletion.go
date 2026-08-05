package inventory

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type FolderDeletionVM struct {
	InventoryItemID uuid.UUID
	Node            string
	VMID            int32
	GuestType       string
	UpstreamUUID    uuid.UUID
	Name            string
	IsTemplate      bool
}

type FolderDeletionPlan struct {
	ProxmoxVMs   []FolderDeletionVM
	ProxmoxPools []string
	RootPoolID   string
}

type deletionBlocker struct {
	BlockerType string
	BlockerName string
}

func blockedError(blockers []deletionBlocker) error {
	if len(blockers) == 0 {
		return nil
	}

	blocker := blockers[0]
	return fmt.Errorf(
		"%w: %s %q references this inventory subtree",
		ErrInventoryItemInUse,
		blocker.BlockerType,
		blocker.BlockerName,
	)
}

func toDeletionBlockers(rows []database.ListInventoryDeletionBlockersInSubtreeRow) []deletionBlocker {
	blockers := make([]deletionBlocker, 0, len(rows))
	for _, row := range rows {
		blockers = append(blockers, deletionBlocker{BlockerType: row.BlockerType, BlockerName: row.BlockerName})
	}
	return blockers
}

func toDeletionBlockersExceptPublishedPod(rows []database.ListInventoryDeletionBlockersInSubtreeExceptPublishedPodRow) []deletionBlocker {
	blockers := make([]deletionBlocker, 0, len(rows))
	for _, row := range rows {
		blockers = append(blockers, deletionBlocker{BlockerType: row.BlockerType, BlockerName: row.BlockerName})
	}
	return blockers
}

// buildFolderDeletionPlan walks id's subtree into VM and pool deletion targets, deepest pools first.
func buildFolderDeletionPlan(
	rows []database.GetAllInventoryItemsRow,
	blockers []deletionBlocker,
	id uuid.UUID,
) (FolderDeletionPlan, error) {
	itemsByID := make(map[uuid.UUID]database.GetAllInventoryItemsRow, len(rows))
	childrenByParent := make(map[uuid.UUID][]uuid.UUID, len(rows))
	for _, row := range rows {
		itemsByID[row.ID] = row
		if row.ParentID != nil {
			childrenByParent[*row.ParentID] = append(childrenByParent[*row.ParentID], row.ID)
		}
	}

	item, ok := itemsByID[id]
	if !ok {
		return FolderDeletionPlan{}, ErrInventoryFolderNotFound
	}
	if item.Kind != database.InventoryItemKindFolder {
		return FolderDeletionPlan{}, ErrInventoryItemNotFolder
	}
	if isManagedRootFolder(item.ParentID) {
		return FolderDeletionPlan{}, ErrInventoryReservedFolder
	}

	if err := blockedError(blockers); err != nil {
		return FolderDeletionPlan{}, err
	}

	basePath, err := folderPathSegments(id, itemsByID)
	if err != nil {
		return FolderDeletionPlan{}, err
	}

	plan := FolderDeletionPlan{RootPoolID: proxmox.EncodePoolPath(basePath)}

	var walk func(uuid.UUID, []string)
	walk = func(itemID uuid.UUID, path []string) {
		current := itemsByID[itemID]

		if current.Kind == database.InventoryItemKindFolder {
			plan.ProxmoxPools = append(plan.ProxmoxPools, proxmox.EncodePoolPath(path))
			for _, childID := range childrenByParent[itemID] {
				child := itemsByID[childID]
				walk(childID, appendFolderPathSegment(path, child.Name))
			}
			return
		}

		isTemplate := current.IsTemplate != nil && *current.IsTemplate
		guestType := "qemu"
		if current.GuestType != nil {
			guestType = *current.GuestType
		}
		if current.Node != nil && current.Vmid != nil {
			plan.ProxmoxVMs = append(plan.ProxmoxVMs, FolderDeletionVM{
				InventoryItemID: current.ID,
				Node:            *current.Node,
				VMID:            *current.Vmid,
				GuestType:       guestType,
				Name:            current.Name,
				IsTemplate:      isTemplate,
			})
		}
	}

	walk(id, basePath)
	sortPoolPathsDeepestFirst(plan.ProxmoxPools)

	return plan, nil
}

// folderPathSegments returns id's full path relative to the managed root, ordered root-to-leaf.
func folderPathSegments(id uuid.UUID, itemsByID map[uuid.UUID]database.GetAllInventoryItemsRow) ([]string, error) {
	path := make([]string, 0, 4)

	current, ok := itemsByID[id]
	if !ok {
		return nil, ErrInventoryFolderNotFound
	}

	for current.ParentID != nil {
		path = append(path, current.Name)

		parent, ok := itemsByID[*current.ParentID]
		if !ok {
			return nil, ErrInventoryParentNotFound
		}
		current = parent
	}

	for left, right := 0, len(path)-1; left < right; left, right = left+1, right-1 {
		path[left], path[right] = path[right], path[left]
	}

	return path, nil
}

func appendFolderPathSegment(path []string, segment string) []string {
	next := make([]string, 0, len(path)+1)
	next = append(next, path...)
	next = append(next, segment)
	return next
}

func sortPoolPathsDeepestFirst(poolIDs []string) {
	sort.Slice(poolIDs, func(i, j int) bool {
		leftDepth := strings.Count(poolIDs[i], "/")
		rightDepth := strings.Count(poolIDs[j], "/")
		if leftDepth != rightDepth {
			return leftDepth > rightDepth
		}
		return poolIDs[i] < poolIDs[j]
	})
}

func (s *Service) BuildFolderDeletionPlan(ctx context.Context, id uuid.UUID) (FolderDeletionPlan, error) {
	q := database.New(s.db)

	rows, err := q.GetAllInventoryItems(ctx)
	if err != nil {
		return FolderDeletionPlan{}, err
	}

	blockerRows, err := q.ListInventoryDeletionBlockersInSubtree(ctx, id)
	if err != nil {
		return FolderDeletionPlan{}, err
	}

	plan, err := buildFolderDeletionPlan(rows, toDeletionBlockers(blockerRows), id)
	if err != nil {
		return FolderDeletionPlan{}, err
	}
	return hydrateFolderDeletionVMIdentities(ctx, q, plan)
}

// BuildPublishedPodFolderDeletionPlan is BuildFolderDeletionPlan excluding podID's own blockers, read through the caller's tx.
func (s *Service) BuildPublishedPodFolderDeletionPlan(
	ctx context.Context,
	tx pgx.Tx,
	folderID uuid.UUID,
	podID uuid.UUID,
) (FolderDeletionPlan, error) {
	q := database.New(tx)

	rows, err := q.GetAllInventoryItems(ctx)
	if err != nil {
		return FolderDeletionPlan{}, err
	}

	blockerRows, err := q.ListInventoryDeletionBlockersInSubtreeExceptPublishedPod(ctx, database.ListInventoryDeletionBlockersInSubtreeExceptPublishedPodParams{
		ID:            folderID,
		ExcludedPodID: podID,
	})
	if err != nil {
		return FolderDeletionPlan{}, err
	}

	plan, err := buildFolderDeletionPlan(rows, toDeletionBlockersExceptPublishedPod(blockerRows), folderID)
	if err != nil {
		return FolderDeletionPlan{}, err
	}
	return hydrateFolderDeletionVMIdentities(ctx, q, plan)
}

func hydrateFolderDeletionVMIdentities(
	ctx context.Context,
	q *database.Queries,
	plan FolderDeletionPlan,
) (FolderDeletionPlan, error) {
	for i := range plan.ProxmoxVMs {
		row, err := q.GetProxmoxVMByInventoryItemID(ctx, plan.ProxmoxVMs[i].InventoryItemID)
		if err != nil {
			return FolderDeletionPlan{}, fmt.Errorf("loading VM identity for %s: %w", plan.ProxmoxVMs[i].InventoryItemID, err)
		}
		plan.ProxmoxVMs[i].UpstreamUUID = row.UpstreamUuid
	}
	return plan, nil
}

func (s *Service) EnsureInventorySubtreeDeletable(ctx context.Context, id uuid.UUID) error {
	blockers, err := database.New(s.db).ListInventoryDeletionBlockersInSubtree(ctx, id)
	if err != nil {
		return err
	}
	return blockedError(toDeletionBlockers(blockers))
}

func (s *Service) DeleteFolder(ctx context.Context, id uuid.UUID) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)

	item, err := q.GetInventoryItemForUpdate(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInventoryFolderNotFound
	}
	if err != nil {
		return err
	}
	if item.Kind != database.InventoryItemKindFolder {
		return ErrInventoryItemNotFolder
	}
	if isManagedRootFolder(item.ParentID) {
		return ErrInventoryReservedFolder
	}

	if err := q.DeleteInventoryItem(ctx, id); err != nil {
		return err
	}

	s.notifyTx(ctx, tx, id)

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	return nil
}

func (s *Service) DeleteInventoryVM(ctx context.Context, itemID uuid.UUID) error {
	if err := s.EnsureInventorySubtreeDeletable(ctx, itemID); err != nil {
		return err
	}
	if err := database.New(s.db).DeleteInventoryItem(ctx, itemID); err != nil {
		return err
	}

	s.notify(ctx, nil)
	return nil
}
