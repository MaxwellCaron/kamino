package vmactions

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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

func (c *PodCloneClaims) ClearAll(ctx context.Context) (int64, error) {
	return database.New(c.db).DeleteAllPodCloneClaims(ctx)
}
