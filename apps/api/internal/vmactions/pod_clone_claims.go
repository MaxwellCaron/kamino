package vmactions

import (
	"context"
	"errors"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type PodCloneClaims struct {
	db database.DBTX
}

func NewPodCloneClaims(db database.DBTX) *PodCloneClaims {
	return &PodCloneClaims{db: db}
}

func (c *PodCloneClaims) Claim(
	ctx context.Context,
	podID uuid.UUID,
	userPrincipalID uuid.UUID,
	action string,
	actorPrincipalID uuid.UUID,
) error {
	_, err := database.New(c.db).ClaimPodClone(ctx, database.ClaimPodCloneParams{
		PodID:            podID,
		UserPrincipalID:  userPrincipalID,
		Action:           action,
		ActorPrincipalID: actorPrincipalID,
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

func (c *PodCloneClaims) Release(ctx context.Context, podID uuid.UUID, userPrincipalID uuid.UUID) error {
	return database.New(c.db).ReleasePodClone(ctx, database.ReleasePodCloneParams{
		PodID:           podID,
		UserPrincipalID: userPrincipalID,
	})
}

func (c *PodCloneClaims) SweepStale(ctx context.Context, olderThan time.Duration) (int64, error) {
	cutoff := pgtype.Timestamptz{
		Time:  time.Now().Add(-olderThan).UTC(),
		Valid: true,
	}
	return database.New(c.db).DeleteStalePodCloneClaims(ctx, cutoff)
}
