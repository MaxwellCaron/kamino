package proxmox

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/errgroup"
)

type InventoryMirror struct {
	db     *pgxpool.Pool
	client *Client

	mu      sync.Mutex
	running bool
	pending bool
}

func NewInventoryMirror(db *pgxpool.Pool, client *Client) *InventoryMirror {
	if client == nil {
		return nil
	}

	return &InventoryMirror{
		db:     db,
		client: client,
	}
}

func (m *InventoryMirror) ScheduleReconcile() {
	if m == nil || m.client == nil {
		return
	}

	m.mu.Lock()
	if m.running {
		m.pending = true
		m.mu.Unlock()
		return
	}
	m.running = true
	m.mu.Unlock()

	go m.run()
}

func (m *InventoryMirror) run() {
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		err := m.Reconcile(ctx)
		cancel()

		if err != nil {
			log.Printf("proxmox mirror reconcile failed: %v", err)
		}

		m.mu.Lock()
		if !m.pending {
			m.running = false
			m.mu.Unlock()
			return
		}
		m.pending = false
		m.mu.Unlock()
	}
}

func (m *InventoryMirror) Reconcile(ctx context.Context) error {
	if m == nil || m.client == nil {
		return nil
	}

	// Snapshot pools before inventory so new folder rows cannot race-delete their pool.
	currentPools, err := m.client.GetPools(ctx)
	if err != nil {
		return fmt.Errorf("loading proxmox pools: %w", err)
	}

	rows, err := database.New(m.db).GetAllInventoryItems(ctx)
	if err != nil {
		return fmt.Errorf("loading inventory tree: %w", err)
	}

	rootID, itemsByID, childrenByParent := buildInventoryIndex(rows)
	if rootID == nil {
		return nil
	}

	desiredPools := make(map[string]*string)
	desiredVMPools := make(map[vmKey]string)
	desiredVMNotes := make(map[vmKey]string)

	var walk func(uuid.UUID, []string)
	walk = func(id uuid.UUID, path []string) {
		row := itemsByID[id]
		nextPath := path

		if id != *rootID && row.Kind == database.InventoryItemKindFolder {
			nextPath = appendPath(path, row.Name)
			poolID := EncodePoolPath(nextPath)
			desiredPools[poolID] = row.Description
		}

		for _, childID := range childrenByParent[id] {
			child := itemsByID[childID]
			if child.Kind == database.InventoryItemKindFolder {
				walk(childID, nextPath)
				continue
			}

			if child.Node == nil || child.Vmid == nil {
				continue
			}

			gt := GuestQEMU
			if child.GuestType != nil {
				gt = GuestType(*child.GuestType)
			}
			key := vmKey{Node: *child.Node, VMID: int(*child.Vmid), GuestType: gt}
			desiredPool := ""
			if len(nextPath) > 0 {
				desiredPool = EncodePoolPath(nextPath)
			}

			desiredVMPools[key] = desiredPool
			if child.Notes != nil {
				desiredVMNotes[key] = *child.Notes
			}
		}
	}

	walk(*rootID, nil)

	currentPoolsByID := make(map[string]Pool, len(currentPools))
	for _, pool := range currentPools {
		currentPoolsByID[pool.PoolID] = pool
	}

	unavailable, poolErrs := m.reconcilePoolDefinitions(ctx, currentPoolsByID, desiredPools)

	effectiveDesiredVMPools := make(map[vmKey]string, len(desiredVMPools))
	for key, desiredPool := range desiredVMPools {
		if desiredPool != "" {
			if _, bad := unavailable[desiredPool]; bad {
				continue
			}
		}
		effectiveDesiredVMPools[key] = desiredPool
	}

	currentVMs, err := m.client.GetVMs(ctx)
	if err != nil {
		return fmt.Errorf("loading proxmox VMs: %w", err)
	}

	currentVMPools := make(map[vmKey]string, len(currentVMs))
	for _, vm := range currentVMs {
		currentVMPools[vmKey{Node: vm.Node, VMID: vm.VMID, GuestType: GuestTypeFromVMType(vm.Type)}] = vm.Pool
	}

	poolGroup, poolCtx := errgroup.WithContext(ctx)
	poolGroup.SetLimit(8)
	for key, desiredPool := range effectiveDesiredVMPools {
		poolGroup.Go(func() error {
			currentPool, exists := currentVMPools[key]
			if !exists || currentPool == desiredPool {
				return nil
			}

			if currentPool != "" {
				if err := m.client.RemoveVMFromPool(poolCtx, currentPool, key.VMID); err != nil {
					return fmt.Errorf("removing VM %d on %s from pool %q: %w", key.VMID, key.Node, currentPool, err)
				}
			}

			if desiredPool != "" {
				if err := m.client.AddVMToPool(poolCtx, desiredPool, key.VMID); err != nil {
					return fmt.Errorf("adding VM %d on %s to pool %q: %w", key.VMID, key.Node, desiredPool, err)
				}
			}

			return nil
		})
	}
	membershipErr := poolGroup.Wait()

	finalVMCounts := finalPoolVMCounts(currentVMPools, effectiveDesiredVMPools)
	for _, poolID := range stalePoolIDs(currentPools, desiredPoolIDs(desiredPools), finalVMCounts) {
		if err := m.client.DeletePool(ctx, poolID); err != nil {
			log.Printf("proxmox mirror: failed to delete stale pool %q: %v", poolID, err)
		}
	}

	notesGroup, notesCtx := errgroup.WithContext(ctx)
	notesGroup.SetLimit(8)
	for key, desiredNotes := range desiredVMNotes {
		notesGroup.Go(func() error {
			if _, exists := currentVMPools[key]; !exists {
				return nil
			}

			if err := m.client.UpdateVMNotes(notesCtx, key.GuestType, key.Node, key.VMID, desiredNotes); err != nil {
				return fmt.Errorf("updating notes for VM %d on %s: %w", key.VMID, key.Node, err)
			}

			return nil
		})
	}
	notesErr := notesGroup.Wait()

	return errors.Join(append(poolErrs, membershipErr, notesErr)...)
}

func (m *InventoryMirror) reconcilePoolDefinitions(
	ctx context.Context,
	currentPoolsByID map[string]Pool,
	desiredPools map[string]*string,
) (unavailable map[string]struct{}, errs []error) {
	unavailable = make(map[string]struct{})
	var skipped []string

	for _, poolID := range sortedPoolIDsByDepth(desiredPoolIDs(desiredPools), false) {
		desiredComment := desiredPoolComment(desiredPools[poolID])
		if existing, exists := currentPoolsByID[poolID]; exists {
			if existing.Comment != desiredComment {
				comment := desiredComment
				var commentPtr *string
				if desiredComment != "" {
					commentPtr = &comment
				}
				if err := m.client.UpdatePoolComment(ctx, poolID, commentPtr); err != nil {
					errs = append(errs, fmt.Errorf("updating pool %q comment: %w", poolID, err))
				}
			}
			continue
		}

		if parentID := parentPoolID(poolID); parentID != "" {
			if _, bad := unavailable[parentID]; bad {
				unavailable[poolID] = struct{}{}
				continue
			}
		}

		if !poolLeafStartsWithLetter(poolID) {
			unavailable[poolID] = struct{}{}
			skipped = append(skipped, poolID)
			continue
		}

		var commentPtr *string
		if desiredComment != "" {
			comment := desiredComment
			commentPtr = &comment
		}
		if err := m.client.CreatePool(ctx, poolID, commentPtr); err != nil {
			errs = append(errs, fmt.Errorf("creating pool %q: %w", poolID, err))
			unavailable[poolID] = struct{}{}
			continue
		}
		currentPoolsByID[poolID] = Pool{PoolID: poolID, Comment: desiredComment}
	}

	if len(skipped) > 0 {
		sort.Strings(skipped)
		log.Printf(
			"proxmox mirror: skipped %d pool(s) PVE9 cannot recreate unchanged: %s",
			len(skipped),
			strings.Join(skipped, ", "),
		)
	}

	return unavailable, errs
}

func parentPoolID(poolID string) string {
	if i := strings.LastIndex(poolID, "/"); i >= 0 {
		return poolID[:i]
	}
	return ""
}

type vmKey struct {
	Node      string
	VMID      int
	GuestType GuestType
}

func buildInventoryIndex(rows []database.GetAllInventoryItemsRow) (*uuid.UUID, map[uuid.UUID]database.GetAllInventoryItemsRow, map[uuid.UUID][]uuid.UUID) {
	itemsByID := make(map[uuid.UUID]database.GetAllInventoryItemsRow, len(rows))
	childrenByParent := make(map[uuid.UUID][]uuid.UUID, len(rows))
	for _, row := range rows {
		itemsByID[row.ID] = row

		if row.ParentID != nil {
			childrenByParent[*row.ParentID] = append(childrenByParent[*row.ParentID], row.ID)
		}
	}

	return FindManagedRootFolderID(rows), itemsByID, childrenByParent
}

func desiredPoolComment(description *string) string {
	if description == nil {
		return ""
	}
	return *description
}

func desiredPoolIDs(desiredPools map[string]*string) map[string]struct{} {
	poolIDs := make(map[string]struct{}, len(desiredPools))
	for poolID := range desiredPools {
		poolIDs[poolID] = struct{}{}
	}
	return poolIDs
}

func appendPath(path []string, segment string) []string {
	next := make([]string, 0, len(path)+1)
	next = append(next, path...)
	next = append(next, segment)
	return next
}

func EncodePoolPath(path []string) string {
	return strings.Join(path, "/")
}

func sortedPoolIDsByDepth(pools map[string]struct{}, deepestFirst bool) []string {
	poolIDs := make([]string, 0, len(pools))
	for poolID := range pools {
		poolIDs = append(poolIDs, poolID)
	}

	sortPoolIDsByDepth(poolIDs, deepestFirst)
	return poolIDs
}

func sortPoolIDsByDepth(poolIDs []string, deepestFirst bool) {
	sort.Slice(poolIDs, func(i, j int) bool {
		leftDepth := poolDepth(poolIDs[i])
		rightDepth := poolDepth(poolIDs[j])
		if leftDepth != rightDepth {
			if deepestFirst {
				return leftDepth > rightDepth
			}
			return leftDepth < rightDepth
		}

		return poolIDs[i] < poolIDs[j]
	})
}

func poolDepth(poolID string) int {
	if poolID == "" {
		return 0
	}
	return strings.Count(poolID, "/")
}

func finalPoolVMCounts(currentVMPools map[vmKey]string, desiredVMPools map[vmKey]string) map[string]int {
	counts := make(map[string]int, len(currentVMPools))
	for key, pool := range currentVMPools {
		if desired, ok := desiredVMPools[key]; ok {
			pool = desired
		}
		if pool != "" {
			counts[pool]++
		}
	}
	return counts
}

func stalePoolIDs(currentPools []Pool, desired map[string]struct{}, finalVMCounts map[string]int) []string {
	currentIDs := make([]string, 0, len(currentPools))
	for _, pool := range currentPools {
		currentIDs = append(currentIDs, pool.PoolID)
	}
	sortPoolIDsByDepth(currentIDs, true)

	kept := make(map[string]bool, len(currentIDs))
	hasKeptDescendant := func(poolID string) bool {
		prefix := poolID + "/"
		for id, keep := range kept {
			if keep && strings.HasPrefix(id, prefix) {
				return true
			}
		}
		return false
	}

	stale := make([]string, 0)
	for _, poolID := range currentIDs {
		if _, ok := desired[poolID]; ok {
			kept[poolID] = true
			continue
		}
		if finalVMCounts[poolID] > 0 || hasKeptDescendant(poolID) {
			kept[poolID] = true
			continue
		}
		stale = append(stale, poolID)
	}
	return stale
}
