package auth

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers/httpx"
	"github.com/MaxwellCaron/kamino/internal/principals"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuthHandler struct {
	Auth          *auth.Service
	Sessions      *auth.SessionManager
	Authenticator principals.Authenticator
	Authz         *authorization.Service
	DB            *pgxpool.Pool
	CookieSecure  bool
}

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type authUser struct {
	ID                    any                                `json:"id"`
	GroupCount            int                                `json:"group_count"`
	Username              string                             `json:"username"`
	ManagementPermissions httpx.ManagementPermissionEnvelope `json:"management_permissions"`
}

type authResponse struct {
	User                 authUser  `json:"user"`
	AccessTokenExpiresAt time.Time `json:"access_token_expires_at"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.WriteInvalidRequest(c, "username and password are required")
		return
	}

	result, err := h.Authenticator.Authenticate(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		if errors.Is(err, principals.ErrInvalidCredentials) {
			httpx.WriteLoggedError(c, http.StatusUnauthorized, "invalid credentials", "authenticate principal", err)
			return
		}
		httpx.WriteLoggedError(c, http.StatusBadGateway, "authentication service unavailable", "authenticate principal", err)
		return
	}

	q := database.New(h.DB)
	providerID, err := q.GetPrincipalProvider(c.Request.Context())
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "authentication service unavailable", "get provider", err)
		return
	}

	principal, err := q.GetPrincipalByExternalID(c.Request.Context(), database.GetPrincipalByExternalIDParams{
		ProviderID: providerID,
		ExternalID: result.ExternalID,
	})
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusUnauthorized, "user not synced — contact an administrator", "lookup principal", err)
		return
	}

	username := result.Username
	if username == "" && principal.Name != nil {
		username = *principal.Name
	}
	if username == "" {
		username = req.Username
	}

	refreshToken, session, err := h.Sessions.CreateSession(
		c.Request.Context(),
		principal.ID,
		c.GetHeader("User-Agent"),
		c.ClientIP(),
	)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to create session", "create auth session", err)
		return
	}

	accessToken, accessExpiresAt, err := h.Auth.GenerateAccessToken(principal.ID, session.ID, username)
	if err != nil {
		_ = h.Sessions.RevokeSession(c.Request.Context(), refreshToken)
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to create session", "sign access token", err)
		return
	}

	httpx.SetAccessCookie(c, accessToken, accessExpiresAt, h.CookieSecure)
	httpx.SetRefreshCookie(c, refreshToken, session.ExpiresAt, h.CookieSecure)

	managementPermissions, err := h.managementPermissions(c.Request.Context(), principal.ID)
	if err != nil {
		_ = h.Sessions.RevokeSession(c.Request.Context(), refreshToken)
		httpx.ClearAccessCookie(c, h.CookieSecure)
		httpx.ClearRefreshCookie(c, h.CookieSecure)
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load access rules", "load management permissions on login", err)
		return
	}
	groupCount, err := h.groupCount(c.Request.Context(), principal.ID)
	if err != nil {
		_ = h.Sessions.RevokeSession(c.Request.Context(), refreshToken)
		httpx.ClearAccessCookie(c, h.CookieSecure)
		httpx.ClearRefreshCookie(c, h.CookieSecure)
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load group memberships", "load group count on login", err)
		return
	}

	c.JSON(http.StatusOK, authResponse{
		User: authUser{
			ID:                    principal.ID,
			GroupCount:            groupCount,
			Username:              username,
			ManagementPermissions: managementPermissions,
		},
		AccessTokenExpiresAt: accessExpiresAt,
	})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	refreshToken, err := c.Cookie(auth.RefreshCookieName)
	if err != nil {
		httpx.ClearAccessCookie(c, h.CookieSecure)
		httpx.ClearRefreshCookie(c, h.CookieSecure)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no refresh token"})
		return
	}

	newRefreshToken, session, err := h.Sessions.RefreshSession(
		c.Request.Context(),
		refreshToken,
		c.GetHeader("User-Agent"),
		c.ClientIP(),
	)
	if err != nil {
		if errors.Is(err, auth.ErrRefreshCollision) {
			c.Header("Retry-After", "1")
			httpx.WriteConflict(c, "refresh already completed; retry")
			return
		}
		httpx.ClearAccessCookie(c, h.CookieSecure)
		httpx.ClearRefreshCookie(c, h.CookieSecure)
		if errors.Is(err, auth.ErrInvalidSession) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
			return
		}
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "authentication service unavailable", "refresh auth session", err)
		return
	}

	q := database.New(h.DB)
	principal, err := q.GetPrincipalByID(c.Request.Context(), session.PrincipalID)
	if err != nil {
		_ = h.Sessions.RevokeSession(c.Request.Context(), newRefreshToken)
		httpx.ClearAccessCookie(c, h.CookieSecure)
		httpx.ClearRefreshCookie(c, h.CookieSecure)
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user no longer exists"})
			return
		}
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "authentication service unavailable", "lookup principal by id", err)
		return
	}

	username := ""
	if principal.Name != nil {
		username = *principal.Name
	}
	if username == "" {
		username = principal.ExternalID
	}

	accessToken, accessExpiresAt, err := h.Auth.GenerateAccessToken(principal.ID, session.ID, username)
	if err != nil {
		_ = h.Sessions.RevokeSession(c.Request.Context(), newRefreshToken)
		httpx.ClearAccessCookie(c, h.CookieSecure)
		httpx.ClearRefreshCookie(c, h.CookieSecure)
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to create session", "sign access token", err)
		return
	}

	httpx.SetAccessCookie(c, accessToken, accessExpiresAt, h.CookieSecure)
	httpx.SetRefreshCookie(c, newRefreshToken, session.ExpiresAt, h.CookieSecure)

	managementPermissions, err := h.managementPermissions(c.Request.Context(), principal.ID)
	if err != nil {
		_ = h.Sessions.RevokeSession(c.Request.Context(), newRefreshToken)
		httpx.ClearAccessCookie(c, h.CookieSecure)
		httpx.ClearRefreshCookie(c, h.CookieSecure)
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load access rules", "load management permissions on refresh", err)
		return
	}
	groupCount, err := h.groupCount(c.Request.Context(), principal.ID)
	if err != nil {
		_ = h.Sessions.RevokeSession(c.Request.Context(), newRefreshToken)
		httpx.ClearAccessCookie(c, h.CookieSecure)
		httpx.ClearRefreshCookie(c, h.CookieSecure)
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load group memberships", "load group count on refresh", err)
		return
	}

	c.JSON(http.StatusOK, authResponse{
		User: authUser{
			ID:                    principal.ID,
			GroupCount:            groupCount,
			Username:              username,
			ManagementPermissions: managementPermissions,
		},
		AccessTokenExpiresAt: accessExpiresAt,
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	if refreshToken, err := c.Cookie(auth.RefreshCookieName); err == nil {
		if revokeErr := h.Sessions.RevokeSession(c.Request.Context(), refreshToken); revokeErr != nil {
			httpx.LogRequestError(c, "revoke auth session on logout", revokeErr)
		}
	}

	httpx.ClearAccessCookie(c, h.CookieSecure)
	httpx.ClearRefreshCookie(c, h.CookieSecure)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("userID")
	username, _ := c.Get("username")
	accessTokenExpiresAt, _ := c.Get("accessTokenExpiresAt")

	expiresAt, _ := accessTokenExpiresAt.(time.Time)
	usernameStr, _ := username.(string)
	principalID, _ := userID.(uuid.UUID)

	managementPermissions, err := h.managementPermissions(c.Request.Context(), principalID)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load access rules", "load management permissions for current user", err)
		return
	}
	groupCount, err := h.groupCount(c.Request.Context(), principalID)
	if err != nil {
		httpx.WriteLoggedError(c, http.StatusInternalServerError, "failed to load group memberships", "load group count for current user", err)
		return
	}

	c.JSON(http.StatusOK, authResponse{
		User: authUser{
			ID:                    userID,
			GroupCount:            groupCount,
			Username:              usernameStr,
			ManagementPermissions: managementPermissions,
		},
		AccessTokenExpiresAt: expiresAt,
	})
}

func (h *AuthHandler) managementPermissions(
	ctx context.Context,
	principalID uuid.UUID,
) (httpx.ManagementPermissionEnvelope, error) {
	if h.Authz == nil || principalID == uuid.Nil {
		return httpx.ManagementPermissionEnvelope{}, nil
	}

	perms, err := h.Authz.EffectiveManagementPermissions(ctx, principalID)
	if err != nil {
		return httpx.ManagementPermissionEnvelope{}, err
	}

	return httpx.ToManagementPermissionEnvelope(perms), nil
}

func (h *AuthHandler) groupCount(
	ctx context.Context,
	principalID uuid.UUID,
) (int, error) {
	if principalID == uuid.Nil {
		return 0, nil
	}

	groups, err := database.New(h.DB).GetUserGroups(ctx, principalID)
	if err != nil {
		return 0, err
	}

	return len(groups), nil
}
