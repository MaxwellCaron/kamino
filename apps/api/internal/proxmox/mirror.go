package proxmox

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	kaminoManagedPoolCommentTag = "Managed by Kamino"
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

	rows, err := database.New(m.db).GetAllInventoryItems(ctx)
	if err != nil {
		return fmt.Errorf("loading inventory tree: %w", err)
	}

	rootID, itemsByID, childrenByParent := buildInventoryIndex(rows)
	if rootID == nil {
		return nil
	}

	desiredPools := make(map[string]string)
	desiredVMPools := make(map[vmKey]string)
	desiredVMNotes := make(map[vmKey]string)

	var walk func(uuid.UUID, []string)
	walk = func(id uuid.UUID, path []string) {
		row := itemsByID[id]
		nextPath := path

		if id != *rootID && row.Kind == database.InventoryItemKindFolder {
			nextPath = appendPath(path, row.Name)
			poolID := EncodePoolPath(nextPath)
			desiredPools[poolID] = ManagedPoolComment(nextPath)
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

			key := vmKey{Node: *child.Node, VMID: int(*child.Vmid)}
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

	currentPools, err := m.client.GetPools(ctx)
	if err != nil {
		return fmt.Errorf("loading proxmox pools: %w", err)
	}

	currentPoolsByID := make(map[string]Pool, len(currentPools))
	for _, pool := range currentPools {
		currentPoolsByID[pool.PoolID] = pool
	}

	for _, poolID := range sortedPoolIDsByDepth(desiredPools, false) {
		comment := desiredPools[poolID]
		current, exists := currentPoolsByID[poolID]
		switch {
		case !exists:
			if err := m.client.CreatePool(ctx, poolID, comment); err != nil {
				return fmt.Errorf("creating pool %q: %w", poolID, err)
			}
		case current.Comment != comment:
			if err := m.client.UpdatePoolComment(ctx, poolID, comment); err != nil {
				return fmt.Errorf("updating pool %q: %w", poolID, err)
			}
		}
	}

	currentVMs, err := m.client.GetVMs(ctx)
	if err != nil {
		return fmt.Errorf("loading proxmox VMs: %w", err)
	}

	currentVMPools := make(map[vmKey]string, len(currentVMs))
	for _, vm := range currentVMs {
		currentVMPools[vmKey{Node: vm.Node, VMID: vm.VMID}] = vm.Pool
	}

	for key, desiredPool := range desiredVMPools {
		currentPool, exists := currentVMPools[key]
		if !exists || currentPool == desiredPool {
			continue
		}

		if currentPool != "" {
			if err := m.client.RemoveVMFromPool(ctx, currentPool, key.VMID); err != nil {
				return fmt.Errorf("removing VM %d on %s from pool %q: %w", key.VMID, key.Node, currentPool, err)
			}
		}

		if desiredPool != "" {
			if err := m.client.AddVMToPool(ctx, desiredPool, key.VMID); err != nil {
				return fmt.Errorf("adding VM %d on %s to pool %q: %w", key.VMID, key.Node, desiredPool, err)
			}
		}
	}

	for key, desiredNotes := range desiredVMNotes {
		if _, exists := currentVMPools[key]; !exists {
			continue
		}

		if err := m.client.UpdateVMNotes(ctx, key.Node, key.VMID, desiredNotes); err != nil {
			return fmt.Errorf("updating notes for VM %d on %s: %w", key.VMID, key.Node, err)
		}
	}

	for _, poolID := range staleManagedPoolIDs(currentPools, desiredPools) {
		if err := m.client.DeletePool(ctx, poolID); err != nil {
			return fmt.Errorf("deleting stale pool %q: %w", poolID, err)
		}
	}

	return nil
}

type vmKey struct {
	Node string
	VMID int
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

	return findManagedRootFolderID(rows), itemsByID, childrenByParent
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

func sortedPoolIDsByDepth(pools map[string]string, deepestFirst bool) []string {
	poolIDs := make([]string, 0, len(pools))
	for poolID := range pools {
		poolIDs = append(poolIDs, poolID)
	}

	sortPoolIDsByDepth(poolIDs, deepestFirst)
	return poolIDs
}

func staleManagedPoolIDs(currentPools []Pool, desiredPools map[string]string) []string {
	poolIDs := make([]string, 0, len(currentPools))
	for _, pool := range currentPools {
		if !strings.HasPrefix(pool.Comment, kaminoManagedPoolCommentTag) {
			continue
		}
		if _, ok := desiredPools[pool.PoolID]; ok {
			continue
		}
		poolIDs = append(poolIDs, pool.PoolID)
	}

	sortPoolIDsByDepth(poolIDs, true)
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
