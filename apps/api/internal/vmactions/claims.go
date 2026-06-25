package vmactions

import (
	"context"
	"errors"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrActionInProgress = errors.New("vm action already in progress")

type Claims struct {
	db database.DBTX
}

func NewClaims(db database.DBTX) *Claims {
	return &Claims{db: db}
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
	return database.New(c.db).ReleaseVMAction(ctx, itemID)
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
