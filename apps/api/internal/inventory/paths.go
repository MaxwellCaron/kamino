package inventory

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type FolderPlacement struct {
	FolderID uuid.UUID
	Path     []string
	PoolID   string
}

func findInventoryRootFolderID(rows []database.GetAllInventoryItemsRow) *uuid.UUID {
	var (
		namedRootID *uuid.UUID
		soleRootID  *uuid.UUID
		rootCount   int
	)

	for _, row := range rows {
		if row.ParentID != nil || row.Kind != database.InventoryItemKindFolder {
			continue
		}

		rootCount++
		id := row.ID
		if row.Name == proxmox.RootFolderName {
			namedRootID = &id
		}
		if soleRootID == nil {
			soleRootID = &id
		}
	}

	if namedRootID != nil {
		return namedRootID
	}
	if rootCount == 1 {
		return soleRootID
	}

	return nil
}

func normalizeFolderPath(path []string) ([]string, error) {
	normalized := make([]string, 0, len(path))
	for _, segment := range path {
		name := names.Normalize(segment)
		if err := names.ValidateFolder(name); err != nil {
			return nil, err
		}
		normalized = append(normalized, name)
	}

	return normalized, nil
}

func ensureFolderChild(
	ctx context.Context,
	q *database.Queries,
	parentID uuid.UUID,
	name string,
) (uuid.UUID, bool, error) {
	id, err := q.GetChildFolderByName(ctx, database.GetChildFolderByNameParams{
		ParentID: &parentID,
		Name:     name,
	})
	if err == nil {
		return id, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, err
	}

	if err := ensureFolderDepthForCreate(ctx, q, parentID); err != nil {
		return uuid.Nil, false, err
	}

	id, err = q.CreateChildFolder(ctx, database.CreateChildFolderParams{
		ParentID: &parentID,
		Name:     name,
	})
	if err != nil {
		if !isUniqueViolation(err) {
			return uuid.Nil, false, err
		}

		id, err = q.GetChildFolderByName(ctx, database.GetChildFolderByNameParams{
			ParentID: &parentID,
			Name:     name,
		})
		if err != nil {
			return uuid.Nil, false, err
		}
		return id, false, nil
	}

	return id, true, nil
}

func (s *Service) EnsureFolderPath(ctx context.Context, path []string) (uuid.UUID, error) {
	return s.EnsureFolderPathWithDescription(ctx, path, nil)
}

func (s *Service) EnsureFolderPathWithDescription(ctx context.Context, path []string, description *string) (uuid.UUID, error) {
	normalizedPath, err := normalizeFolderPath(path)
	if err != nil {
		return uuid.Nil, err
	}

	normalizedDescription, err := NormalizeFolderDescription(description)
	if err != nil {
		return uuid.Nil, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	rows, err := q.GetAllInventoryItems(ctx)
	if err != nil {
		return uuid.Nil, err
	}

	rootID := findInventoryRootFolderID(rows)
	created := false
	if rootID == nil {
		id, err := q.CreateRootFolder(ctx, proxmox.RootFolderName)
		if err != nil {
			return uuid.Nil, err
		}
		rootID = &id
		created = true
	}

	currentID := *rootID
	for _, segment := range normalizedPath {
		nextID, didCreate, err := ensureFolderChild(ctx, q, currentID, segment)
		if err != nil {
			return uuid.Nil, err
		}
		currentID = nextID
		created = created || didCreate
	}

	if normalizedDescription != nil {
		if err := q.UpdateInventoryFolderDescription(ctx, database.UpdateInventoryFolderDescriptionParams{
			Description: normalizedDescription,
			ID:          currentID,
		}); err != nil {
			return uuid.Nil, err
		}
	}

	if created || normalizedDescription != nil {
		s.notifyTx(ctx, tx, currentID)
	}

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}

	return currentID, nil
}

func (s *Service) EnsureChildFolder(ctx context.Context, parentID uuid.UUID, name string) (uuid.UUID, error) {
	return s.EnsureChildFolderWithDescription(ctx, parentID, name, nil)
}

func (s *Service) EnsureChildFolderWithDescription(
	ctx context.Context,
	parentID uuid.UUID,
	name string,
	description *string,
) (uuid.UUID, error) {
	normalizedName := names.Normalize(name)
	if err := names.ValidateFolder(normalizedName); err != nil {
		return uuid.Nil, err
	}

	normalizedDescription, err := NormalizeFolderDescription(description)
	if err != nil {
		return uuid.Nil, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	q := database.New(tx)
	folderID, created, err := ensureFolderChild(ctx, q, parentID, normalizedName)
	if err != nil {
		return uuid.Nil, err
	}

	if normalizedDescription != nil {
		if err := q.UpdateInventoryFolderDescription(ctx, database.UpdateInventoryFolderDescriptionParams{
			Description: normalizedDescription,
			ID:          folderID,
		}); err != nil {
			return uuid.Nil, err
		}
	}

	if created || normalizedDescription != nil {
		s.notifyTx(ctx, tx, folderID)
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}

	return folderID, nil
}

func (s *Service) FindFolderPath(ctx context.Context, path []string) (uuid.UUID, bool, error) {
	normalizedPath, err := normalizeFolderPath(path)
	if err != nil {
		return uuid.Nil, false, err
	}

	rows, err := database.New(s.db).GetAllInventoryItems(ctx)
	if err != nil {
		return uuid.Nil, false, err
	}

	rootID := findInventoryRootFolderID(rows)
	if rootID == nil {
		return uuid.Nil, false, nil
	}

	currentID := *rootID
	for _, segment := range normalizedPath {
		nextID, ok := findInventoryChildFolderID(rows, currentID, segment)
		if !ok {
			return uuid.Nil, false, nil
		}
		currentID = nextID
	}

	return currentID, true, nil
}

func findInventoryChildFolderID(
	rows []database.GetAllInventoryItemsRow,
	parentID uuid.UUID,
	name string,
) (uuid.UUID, bool) {
	for _, row := range rows {
		if row.Kind != database.InventoryItemKindFolder || row.ParentID == nil {
			continue
		}
		if *row.ParentID == parentID && row.Name == name {
			return row.ID, true
		}
	}
	return uuid.Nil, false
}

func (s *Service) ChildFolderExists(ctx context.Context, parentID uuid.UUID, name string) (bool, error) {
	name = names.Normalize(name)
	if err := names.ValidateFolder(name); err != nil {
		return false, err
	}

	_, err := database.New(s.db).GetChildFolderByName(ctx, database.GetChildFolderByNameParams{
		ParentID: &parentID,
		Name:     name,
	})
	if err == nil {
		return true, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return false, err
}

func (s *Service) ResolveFolderPlacement(ctx context.Context, id uuid.UUID) (FolderPlacement, error) {
	rows, err := database.New(s.db).GetAllInventoryItems(ctx)
	if err != nil {
		return FolderPlacement{}, err
	}

	itemsByID := make(map[uuid.UUID]database.GetAllInventoryItemsRow, len(rows))
	for _, row := range rows {
		itemsByID[row.ID] = row
	}

	item, ok := itemsByID[id]
	if !ok {
		return FolderPlacement{}, ErrInventoryFolderNotFound
	}
	if item.Kind != database.InventoryItemKindFolder {
		return FolderPlacement{}, ErrInventoryItemNotFolder
	}

	path := make([]string, 0, 4)
	for current := item; ; {
		if current.ParentID == nil {
			break
		}

		path = append(path, current.Name)

		parent, ok := itemsByID[*current.ParentID]
		if !ok {
			return FolderPlacement{}, ErrInventoryParentNotFound
		}
		current = parent
	}

	for left, right := 0, len(path)-1; left < right; left, right = left+1, right-1 {
		path[left], path[right] = path[right], path[left]
	}

	return FolderPlacement{
		FolderID: id,
		Path:     path,
		PoolID:   proxmox.EncodePoolPath(path),
	}, nil
}
