package authorization

import (
	"context"
	"errors"
	"sync"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

type principalCacheKey struct{}

// principalCache memoizes ListEffectivePrincipalIDs results
type principalCache struct {
	mu   sync.Mutex
	data map[uuid.UUID][]uuid.UUID
}

// WithPrincipalCache returns a context carrying a per-request cache
func WithPrincipalCache(ctx context.Context) context.Context {
	return context.WithValue(ctx, principalCacheKey{}, &principalCache{
		data: make(map[uuid.UUID][]uuid.UUID),
	})
}

func loadEffectivePrincipalIDs(
	ctx context.Context,
	db dbtx,
	principalID uuid.UUID,
) ([]uuid.UUID, error) {
	cache, _ := ctx.Value(principalCacheKey{}).(*principalCache)
	if cache != nil {
		cache.mu.Lock()
		ids, ok := cache.data[principalID]
		cache.mu.Unlock()
		if ok {
			return ids, nil
		}
	}

	ids, err := database.New(db).ListEffectivePrincipalIDs(ctx, principalID)
	if err != nil {
		return nil, err
	}

	if cache != nil {
		cache.mu.Lock()
		cache.data[principalID] = ids
		cache.mu.Unlock()
	}

	return ids, nil
}

func HasProtectedPrincipalAccess(
	ctx context.Context,
	db dbtx,
	principalID uuid.UUID,
	protectedPrincipalIDs map[uuid.UUID]struct{},
) (bool, error) {
	if len(protectedPrincipalIDs) == 0 {
		return false, nil
	}

	effectivePrincipalIDs, err := loadEffectivePrincipalIDs(ctx, db, principalID)
	if err != nil {
		return false, err
	}

	for _, effectivePrincipalID := range effectivePrincipalIDs {
		if _, ok := protectedPrincipalIDs[effectivePrincipalID]; ok {
			return true, nil
		}
	}

	return false, nil
}

func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

func managementPermissionSliceHas(
	permissions []ManagementPermission,
	required ManagementPermission,
) bool {
	for _, permission := range permissions {
		if permission == required {
			return true
		}
	}

	return false
}

func targetKindForInventoryItemKind(kind database.InventoryItemKind) InventoryPermissionTargetKind {
	if kind == database.InventoryItemKindFolder {
		return InventoryPermissionTargetKindFolder
	}

	return InventoryPermissionTargetKindVM
}
