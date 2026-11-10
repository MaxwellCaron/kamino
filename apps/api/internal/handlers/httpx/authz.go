package httpx

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// liveCheckInterval is the shared SSE/VNC live-session revalidation cadence.
const LiveCheckInterval = 20 * time.Second

// liveSessionValidator rechecks an already-established connection's session family.
type LiveSessionValidator interface {
	ValidateLiveSession(ctx context.Context, sessionID, principalID uuid.UUID) error
}

type PermissionEnvelope struct {
	AllowedMask authorization.Mask `json:"allowed_mask"`
	DeniedMask  authorization.Mask `json:"denied_mask"`
	RequestMask authorization.Mask `json:"request_mask"`
}

type ManagementPermissionEnvelope struct {
	Grants []authorization.ManagementPermission `json:"grants"`
}

func CurrentPrincipalID(c *gin.Context) (uuid.UUID, bool) {
	value, ok := c.Get("userID")
	if !ok {
		return uuid.Nil, false
	}

	id, ok := value.(uuid.UUID)
	return id, ok && id != uuid.Nil
}

func CurrentSessionID(c *gin.Context) (uuid.UUID, bool) {
	value, ok := c.Get("sessionID")
	if !ok {
		return uuid.Nil, false
	}

	id, ok := value.(uuid.UUID)
	return id, ok && id != uuid.Nil
}

// freshAuthzContext wraps ctx in a new, empty principal-expansion cache.
func FreshAuthzContext(ctx context.Context) context.Context {
	return authorization.WithPrincipalCache(ctx)
}

func ToPermissionEnvelope(value authorization.EffectivePermissions) PermissionEnvelope {
	return PermissionEnvelope{
		AllowedMask: value.AllowedMask,
		DeniedMask:  value.DeniedMask,
		RequestMask: value.RequestMask,
	}
}

func ToManagementPermissionEnvelope(
	value authorization.EffectiveManagementPermissions,
) ManagementPermissionEnvelope {
	return ManagementPermissionEnvelope{
		Grants: value.Grants,
	}
}

func RequireInventoryPermission(
	c *gin.Context,
	authzService InventoryAuthorizer,
	principalID uuid.UUID,
	itemID uuid.UUID,
	required authorization.Mask,
) bool {
	err := authzService.Require(c.Request.Context(), principalID, itemID, required)
	switch {
	case err == nil:
		return true
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return false
	case authorization.IsForbidden(err):
		WriteForbidden(c)
		return false
	default:
		WriteLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize inventory resource", err)
		return false
	}
}

func RequireManagementPermission(
	c *gin.Context,
	authzService interface {
		RequireManagement(
			ctx context.Context,
			principalID uuid.UUID,
			required authorization.ManagementPermission,
		) error
	},
	principalID uuid.UUID,
	required authorization.ManagementPermission,
) bool {
	err := authzService.RequireManagement(c.Request.Context(), principalID, required)
	switch {
	case err == nil:
		return true
	case authorization.IsForbidden(err):
		WriteForbidden(c)
		return false
	default:
		WriteLoggedError(c, http.StatusInternalServerError, "authorization failed", "authorize management resource", err)
		return false
	}
}

type InventoryAuthorizer interface {
	Require(context.Context, uuid.UUID, uuid.UUID, authorization.Mask) error
}
