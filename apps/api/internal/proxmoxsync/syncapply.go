package proxmoxsync

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/poolpath"
	"github.com/google/uuid"
)

type SyncSelection struct {
	AddIDs    []string `json:"add_ids"`
	RemoveIDs []string `json:"remove_ids"`
	UpdateIDs []string `json:"update_ids"`
}

type SyncApplyResult struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Status string `json:"status"` // "success" | "error" | "skipped"
	Error  string `json:"error,omitempty"`
}

func skippedSyncResult(id string, kind SyncChangeKind, reason string) SyncApplyResult {
	return SyncApplyResult{ID: id, Kind: string(kind), Status: "skipped", Error: reason}
}

func firstBlockerMessage(blockers []string) string {
	if len(blockers) == 0 {
		return "blocked"
	}
	return "blocked: " + blockers[0]
}

type syncApplyDecision struct {
	Skip   bool
	Reason string
}

func decideSyncApply(byID map[string]SyncChange, id string) (SyncChange, syncApplyDecision) {
	change, ok := byID[id]
	if !ok {
		return SyncChange{}, syncApplyDecision{Skip: true, Reason: "no longer present in live diff"}
	}
	if !change.Actionable {
		return change, syncApplyDecision{Skip: true, Reason: firstBlockerMessage(change.Blockers)}
	}
	return change, syncApplyDecision{}
}

// ApplySync re-derives the live diff, then applies the selected subset; a row no longer actionable is skipped.
func (s *InventoryImporter) ApplySync(
	ctx context.Context,
	sel SyncSelection,
) ([]SyncApplyResult, error) {
	diff, err := s.Plan(ctx)
	if err != nil {
		return nil, fmt.Errorf("re-deriving live diff: %w", err)
	}
	return s.applySyncDiff(ctx, diff, sel), nil
}

// SyncAll applies every change in the current drift plan, matching the admin
// page's Sync All action. Non-actionable changes are reported and skipped.
func (s *InventoryImporter) SyncAll(ctx context.Context) error {
	log.Println("Starting Proxmox Sync All")

	diff, err := s.Plan(ctx)
	if err != nil {
		return fmt.Errorf("planning Proxmox Sync All: %w", err)
	}
	if diff.Warning != "" {
		log.Printf("Proxmox Sync All warning: %s", diff.Warning)
	}

	applied := 0
	skipped := 0
	var syncErrs []error
	for _, change := range syncAllChanges(diff) {
		if change.Kind == SyncChangeRemove && len(syncErrs) > 0 {
			skipped++
			log.Printf("Proxmox Sync All skipped removal %s: import failures require reconciliation first", change.ID)
			continue
		}
		results, applyErr := s.ApplySync(ctx, syncSelectionForChange(change))
		if applyErr != nil {
			syncErrs = append(syncErrs, fmt.Errorf("%s %s: %w", change.Kind, change.ID, applyErr))
			if ctx.Err() != nil {
				break
			}
			continue
		}

		for _, result := range results {
			switch result.Status {
			case "success":
				applied++
			case "skipped":
				skipped++
				log.Printf("Proxmox Sync All skipped %s %s: %s", result.Kind, result.ID, result.Error)
			case "error":
				syncErrs = append(syncErrs, fmt.Errorf("%s %s: %s", result.Kind, result.ID, result.Error))
			}
		}
	}

	log.Printf(
		"Proxmox Sync All complete: %d applied, %d skipped, %d failed",
		applied,
		skipped,
		len(syncErrs),
	)
	return errors.Join(syncErrs...)
}

func syncAllChanges(diff SyncDiff) []SyncChange {
	changes := make([]SyncChange, 0, len(diff.Adds)+len(diff.Updates)+len(diff.Removes))
	changes = append(changes, diff.Adds...)
	changes = append(changes, diff.Updates...)
	changes = append(changes, diff.Removes...)
	return changes
}

func syncSelectionForChange(change SyncChange) SyncSelection {
	selection := SyncSelection{}
	switch change.Kind {
	case SyncChangeAdd:
		selection.AddIDs = []string{change.ID}
	case SyncChangeRemove:
		selection.RemoveIDs = []string{change.ID}
	case SyncChangeUpdate:
		selection.UpdateIDs = []string{change.ID}
	}
	return selection
}

func (s *InventoryImporter) applySyncDiff(
	ctx context.Context,
	diff SyncDiff,
	sel SyncSelection,
) []SyncApplyResult {

	addsByID := indexChanges(diff.Adds)
	removesByID := indexChanges(diff.Removes)
	updatesByID := indexChanges(diff.Updates)

	q := database.New(s.db)

	var results []SyncApplyResult

	for _, id := range sel.AddIDs {
		change, decision := decideSyncApply(addsByID, id)
		if decision.Skip {
			results = append(results, skippedSyncResult(id, SyncChangeAdd, decision.Reason))
			continue
		}
		results = append(results, s.applyAdd(ctx, q, change))
	}

	for _, id := range sel.UpdateIDs {
		change, decision := decideSyncApply(updatesByID, id)
		if decision.Skip {
			results = append(results, skippedSyncResult(id, SyncChangeUpdate, decision.Reason))
			continue
		}
		results = append(results, s.applyUpdate(ctx, q, change))
	}

	// Do not remove inventory after a partially failed import.
	importFailed := false
	for _, result := range results {
		if result.Status == "error" {
			importFailed = true
		}
	}

	for _, id := range sel.RemoveIDs {
		if importFailed {
			results = append(results, skippedSyncResult(id, SyncChangeRemove, "import failures require reconciliation first"))
			continue
		}
		change, decision := decideSyncApply(removesByID, id)
		if decision.Skip {
			results = append(results, skippedSyncResult(id, SyncChangeRemove, decision.Reason))
			continue
		}
		results = append(results, s.applyRemove(ctx, q, change))
	}

	return results
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

	parentID, err := ensureImportedPoolParent(ctx, q, rootID, change.Pool)
	if err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("syncing pool folder: %v", err)
		log.Printf("proxmox sync add %s: %v", change.ID, err)
		return result
	}

	if err := s.importVM(ctx, parentID, change.Node, change.VMID, proxmox.GuestType(change.GuestType)); err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("sync vm into inventory folder %s (Proxmox pool %q): %v", parentID, change.Pool, err)
		log.Printf("proxmox sync add %s: %s", change.ID, result.Error)
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

	rootID, err := ensureRootFolder(ctx, q)
	if err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("resolving root folder: %v", err)
		return result
	}
	parentID, err := ensureImportedPoolParent(ctx, q, rootID, change.Pool)
	if err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("syncing pool folder: %v", err)
		return result
	}

	if err := s.importVM(ctx, parentID, change.Node, change.VMID, proxmox.GuestType(change.GuestType)); err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("sync vm into inventory folder %s (Proxmox pool %q): %v", parentID, change.Pool, err)
		log.Printf("proxmox sync update %s: %s", change.ID, result.Error)
		return result
	}

	result.Status = "success"
	return result
}

func ensureImportedPoolParent(ctx context.Context, q *database.Queries, rootID uuid.UUID, poolID string) (uuid.UUID, error) {
	if poolID == "" {
		return rootID, nil
	}
	return ensureFolderPath(ctx, q, rootID, poolpath.Decode(poolID))
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

	// An earlier add may have reconciled a node migration onto this same item.
	current, err := q.GetProxmoxVMByInventoryItemID(ctx, change.ItemID)
	if err != nil {
		result.Status = "skipped"
		result.Error = fmt.Sprintf("cannot revalidate inventory mapping: %v", err)
		return result
	}
	if current.Node != change.Node || int(current.Vmid) != change.VMID {
		return skippedSyncResult(change.ID, SyncChangeRemove, "inventory mapping changed since the diff")
	}
	// Absence from a cluster listing alone is insufficient evidence for deletion.
	checkCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	_, configErr := s.client.GetVMConfig(checkCtx, proxmox.GuestType(current.GuestType), current.Node, int(current.Vmid))
	if configErr == nil {
		return skippedSyncResult(change.ID, SyncChangeRemove, "guest config still exists in Proxmox")
	}
	if !proxmox.IsNotFound(configErr) {
		return skippedSyncResult(change.ID, SyncChangeRemove, fmt.Sprintf("cannot confirm guest is absent; inventory preserved: %v", configErr))
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("beginning inventory removal: %v", err)
		return result
	}
	defer tx.Rollback(ctx)
	q = database.New(tx)
	locked, err := q.GetProxmoxVMByInventoryItemIDForUpdate(ctx, change.ItemID)
	if err != nil || locked.Node != current.Node || locked.Vmid != current.Vmid || locked.UpstreamUuid != current.UpstreamUuid || locked.GuestType != current.GuestType {
		return skippedSyncResult(change.ID, SyncChangeRemove, "inventory mapping changed or could not be locked; inventory preserved")
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

	if err := tx.Commit(ctx); err != nil {
		result.Status = "error"
		result.Error = fmt.Sprintf("committing inventory removal: %v", err)
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
