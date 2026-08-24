package vmactions

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/observability"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	VMActionClaimStaleAge       = 2 * time.Hour
	VMActionClaimSweepInterval  = 10 * time.Minute
	vmActionClaimReleaseTimeout = 5 * time.Second
)

var ErrActionInProgress = errors.New("vm action already in progress")

type Claims struct {
	db  database.DBTX
	tel *observability.Telemetry
}

func NewClaims(db database.DBTX, tel *observability.Telemetry) *Claims {
	return &Claims{db: db, tel: tel}
}

func (c *Claims) Claim(
	ctx context.Context,
	itemID uuid.UUID,
	action string,
	actorPrincipalID uuid.UUID,
	detail string,
) error {
	var detailPtr *string
	if detail != "" {
		detailPtr = &detail
	}

	_, err := database.New(c.db).ClaimVMAction(ctx, database.ClaimVMActionParams{
		InventoryItemID:  itemID,
		Action:           action,
		ActorPrincipalID: actorPrincipalID,
		Detail:           detailPtr,
	})
	switch {
	case err == nil:
		return nil
	case errors.Is(err, pgx.ErrNoRows):
		return ErrActionInProgress
	default:
		return err
	}
}

func (c *Claims) Release(ctx context.Context, itemID uuid.UUID) error {
	releaseCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), vmActionClaimReleaseTimeout)
	defer cancel()
	return database.New(c.db).ReleaseVMAction(releaseCtx, itemID)
}

func (c *Claims) SweepStale(ctx context.Context, olderThan time.Duration) (int64, error) {
	cutoff := pgtype.Timestamptz{
		Time:  time.Now().Add(-olderThan).UTC(),
		Valid: true,
	}
	return database.New(c.db).DeleteStaleVMActionClaims(ctx, cutoff)
}

func (c *Claims) StartRecovery(ctx context.Context) {
	c.startRecovery(ctx, VMActionClaimStaleAge, VMActionClaimSweepInterval)
}

func (c *Claims) startRecovery(ctx context.Context, staleAge, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	c.runStaleSweep(ctx, staleAge)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.runStaleSweep(ctx, staleAge)
		}
	}
}

func (c *Claims) runStaleSweep(ctx context.Context, staleAge time.Duration) {
	_ = observability.RunBackgroundJob(ctx, c.tel, observability.JobVMClaimRecovery, func(jobCtx context.Context) error {
		swept, err := c.SweepStale(jobCtx, staleAge)
		if err != nil {
			return err
		}
		if swept > 0 {
			slog.InfoContext(jobCtx, "swept stale vm action claims", slog.Int64("swept", swept))
		}
		return nil
	})
}

func (c *Claims) WithClaim(
	ctx context.Context,
	itemID uuid.UUID,
	action string,
	actorPrincipalID uuid.UUID,
	detail string,
	fn func() error,
) error {
	if err := c.Claim(ctx, itemID, action, actorPrincipalID, detail); err != nil {
		return err
	}
	defer func() {
		_ = c.Release(ctx, itemID)
	}()

	return fn()
}

func IsActionInProgress(err error) bool {
	return errors.Is(err, ErrActionInProgress)
}
