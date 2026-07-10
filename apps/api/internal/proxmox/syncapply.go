package proxmox

import (
	"context"
	"fmt"
	"log"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
)

// SyncSelection carries the IDs the admin chose to apply.
type SyncSelection struct {
	AddIDs    []string `json:"add_ids"`
	RemoveIDs []string `json:"remove_ids"`
	UpdateIDs []string `json:"update_ids"`
}

// SyncApplyResult is the per-item outcome of an ApplySync call.
type SyncApplyResult struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Status string `json:"status"` // "success" | "error" | "skipped"
	Error  string `json:"error,omitempty"`
}

// ApplySync re-derives the live diff, then applies the selected subset.
// Adds and updates reuse SyncVM (idempotent importer path).
// Removes are DB-only deletes — the VM is already gone from Proxmox.
// Results are collected per-item; a single failure does not abort the batch.
func (s *InventoryImporter) ApplySync(
	ctx context.Context,
	sel SyncSelection,
) ([]SyncApplyResult, error) {
	diff, err := s.Plan(ctx)
	if err != nil {
		return nil, fmt.Errorf("re-deriving live diff: %w", err)
	}

	// Index the live diff by ID and kind so we can look up the DB item IDs.
	addsByID := indexChanges(diff.Adds)
	removesByID := indexChanges(diff.Removes)
	updatesByID := indexChanges(diff.Updates)

	q := database.New(s.db)

	var results []SyncApplyResult

	// --- Adds ---
	for _, id := range sel.AddIDs {
		change, ok := addsByID[id]
		if !ok {
			results = append(results, SyncApplyResult{
				ID:     id,
				Kind:   string(SyncChangeAdd),
				Status: "skipped",
				Error:  "no longer present in live diff",
			})
			continue
		}

		res := s.applyAdd(ctx, q, change)
		results = append(results, res)
	}

	// --- Updates ---
	for _, id := range sel.UpdateIDs {
		change, ok := updatesByID[id]
		if !ok {
			results = append(results, SyncApplyResult{
				ID:     id,
				Kind:   string(SyncChangeUpdate),
				Status: "skipped",
				Error:  "no longer present in live diff",
			})
			continue
		}

		res := s.applyUpdate(ctx, q, change)
		results = append(results, res)
	}

	// --- Removes ---
	for _, id := range sel.RemoveIDs {
		change, ok := removesByID[id]
		if !ok {
			results = append(results, SyncApplyResult{
				ID:     id,
				Kind:   string(SyncChangeRemove),
				Status: "skipped",
				Error:  "no longer present in live diff",
			})
			continue
		}

		res := s.applyRemove(ctx, q, change)
		results = append(results, res)
	}

	return results, nil
}

func (s *InventoryImporter) applyAdd(
	ctx context.Context,
	q *database.Queries,
	change SyncChange,
) SyncApplyResult {
	result := SyncApplyResult{ID: change.ID, Kind: string(SyncChangeAdd)}

	rootID, err := ensureRootFolder(ctx, q)
	if err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("ensuring root folder: %v", err)
		log.Printf("proxmox sync add %s: %v", change.ID, err)
		return result
	}

	parentID := rootID
	if change.Pool != "" {
		folderID, err := ensureFolderPath(ctx, q, rootID, decodePoolPath(change.Pool))
		if err != nil {
			log.Printf("proxmox sync add %s: ensuring pool folder %q: %v", change.ID, change.Pool, err)
		} else {
			parentID = folderID
		}
	}

	if _, err := s.SyncVM(ctx, parentID, change.Node, change.VMID, GuestType(change.GuestType)); err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("sync vm: %v", err)
		log.Printf("proxmox sync add %s: %v", change.ID, err)
		return result
	}

	result.Status = "success"
	return result
}

func (s *InventoryImporter) applyUpdate(
	ctx context.Context,
	q *database.Queries,
	change SyncChange,
) SyncApplyResult {
	result := SyncApplyResult{ID: change.ID, Kind: string(SyncChangeUpdate)}

	// Resolve the parent: use the DB parent so we don't move the VM.
	parentID := uuid.Nil
	if change.ParentID != nil {
		parentID = *change.ParentID
	} else {
		// Fallback: ensure root folder as parent.
		rootID, err := ensureRootFolder(ctx, q)
		if err != nil {
			result.Status = "error"
			result.Error = fmt.Sprintf("resolving parent folder: %v", err)
			return result
		}
		parentID = rootID
	}

	if _, err := s.SyncVM(ctx, parentID, change.Node, change.VMID, GuestType(change.GuestType)); err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("sync vm: %v", err)
		log.Printf("proxmox sync update %s: %v", change.ID, err)
		return result
	}

	result.Status = "success"
	return result
}

func (s *InventoryImporter) applyRemove(
	ctx context.Context,
	q *database.Queries,
	change SyncChange,
) SyncApplyResult {
	result := SyncApplyResult{ID: change.ID, Kind: string(SyncChangeRemove)}

	if change.ItemID == uuid.Nil {
		result.Status = "skipped"
		result.Error = "missing inventory item ID"
		return result
	}

	// Re-check blockers immediately before deleting.
	blockers, err := q.ListInventoryDeletionBlockersInSubtree(ctx, change.ItemID)
	if err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("checking blockers: %v", err)
		log.Printf("proxmox sync remove %s: checking blockers: %v", change.ID, err)
		return result
	}
	if len(blockers) > 0 {
		result.Status = "skipped"
		result.Error = "blocked: " + blockers[0].BlockerType + ": " + blockers[0].BlockerName
		return result
	}

	if err := q.DeleteInventoryItem(ctx, change.ItemID); err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("delete inventory item: %v", err)
		log.Printf("proxmox sync remove %s: %v", change.ID, err)
		return result
	}

	result.Status = "success"
	return result
}

func indexChanges(changes []SyncChange) map[string]SyncChange {
	m := make(map[string]SyncChange, len(changes))
	for _, c := range changes {
		m[c.ID] = c
	}
	return m
}
