package podnetworks

import (
	"context"
	"fmt"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func WithPodNetworkAllocation(
	ctx context.Context,
	pool *pgxpool.Pool,
	fn func(ctx context.Context, tx pgx.Tx) error,
) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin pod network allocation transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := database.New(tx).AcquirePodNetworkAllocationLock(ctx); err != nil {
		return fmt.Errorf("acquire pod network allocation lock: %w", err)
	}
	if err := fn(ctx, tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit pod network allocation transaction: %w", err)
	}
	return nil
}
