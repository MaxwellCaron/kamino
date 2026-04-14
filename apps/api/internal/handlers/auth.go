package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/principals/activedirectory"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuthHandler struct {
	Auth         *auth.Service
	Sessions     *auth.SessionManager
	ADClient     *activedirectory.Client
	DB           *pgxpool.Pool
	CookieSecure bool
}

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type authUser struct {
	ID       any    `json:"id"`
	Username string `json:"username"`
}

type authResponse struct {
	User                 authUser  `json:"user"`
	AccessTokenExpiresAt time.Time `json:"access_token_expires_at"`
}

const (
	accessCookiePath  = "/"
	refreshCookiePath = "/api/v1/auth"
)

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "username and password are required")
		return
	}

	result, err := h.ADClient.Authenticate(req.Username, req.Password)
	if err != nil {
		writeLoggedError(c, http.StatusUnauthorized, "invalid credentials", "ad authenticate", err)
		return
	}

	q := database.New(h.DB)
	providerID, err := q.GetPrincipalProvider(c.Request.Context())
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "authentication service unavailable", "get provider", err)
		return
	}

	principal, err := q.GetPrincipalByExternalID(c.Request.Context(), database.GetPrincipalByExternalIDParams{
		ProviderID: providerID,
		ExternalID: result.SID,
	})
	if err != nil {
		writeLoggedError(c, http.StatusUnauthorized, "user not synced — contact an administrator", "lookup principal", err)
		return
	}

	username := result.Name
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
		writeLoggedError(c, http.StatusInternalServerError, "failed to create session", "create auth session", err)
		return
	}

	accessToken, accessExpiresAt, err := h.Auth.GenerateAccessToken(principal.ID, session.ID, username)
	if err != nil {
		_ = h.Sessions.RevokeSession(c.Request.Context(), refreshToken)
		writeLoggedError(c, http.StatusInternalServerError, "failed to create session", "sign access token", err)
		return
	}

	setAccessCookie(c, accessToken, accessExpiresAt, h.CookieSecure)
	setRefreshCookie(c, refreshToken, session.ExpiresAt, h.CookieSecure)
	c.JSON(http.StatusOK, authResponse{
		User: authUser{
			ID:       principal.ID,
			Username: username,
		},
		AccessTokenExpiresAt: accessExpiresAt,
	})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	refreshToken, err := c.Cookie(auth.RefreshCookieName)
	if err != nil {
		clearAccessCookie(c, h.CookieSecure)
		clearRefreshCookie(c, h.CookieSecure)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no refresh token"})
		return
	}

	newRefreshToken, session, err := h.Sessions.RotateSession(
		c.Request.Context(),
		refreshToken,
		c.GetHeader("User-Agent"),
		c.ClientIP(),
	)
	if err != nil {
		clearAccessCookie(c, h.CookieSecure)
		clearRefreshCookie(c, h.CookieSecure)
		if errors.Is(err, auth.ErrInvalidSession) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
			return
		}
		writeLoggedError(c, http.StatusInternalServerError, "authentication service unavailable", "rotate auth session", err)
		return
	}

	q := database.New(h.DB)
	principal, err := q.GetPrincipalByID(c.Request.Context(), session.PrincipalID)
	if err != nil {
		_ = h.Sessions.RevokeSession(c.Request.Context(), newRefreshToken)
		clearAccessCookie(c, h.CookieSecure)
		clearRefreshCookie(c, h.CookieSecure)
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user no longer exists"})
			return
		}
		writeLoggedError(c, http.StatusInternalServerError, "authentication service unavailable", "lookup principal by id", err)
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
		clearAccessCookie(c, h.CookieSecure)
		clearRefreshCookie(c, h.CookieSecure)
		writeLoggedError(c, http.StatusInternalServerError, "failed to create session", "sign access token", err)
		return
	}

	setAccessCookie(c, accessToken, accessExpiresAt, h.CookieSecure)
	setRefreshCookie(c, newRefreshToken, session.ExpiresAt, h.CookieSecure)
	c.JSON(http.StatusOK, authResponse{
		User: authUser{
			ID:       principal.ID,
			Username: username,
		},
		AccessTokenExpiresAt: accessExpiresAt,
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	if refreshToken, err := c.Cookie(auth.RefreshCookieName); err == nil {
		if revokeErr := h.Sessions.RevokeSession(c.Request.Context(), refreshToken); revokeErr != nil {
			logRequestError(c, "revoke auth session on logout", revokeErr)
		}
	}

	clearAccessCookie(c, h.CookieSecure)
	clearRefreshCookie(c, h.CookieSecure)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("userID")
	username, _ := c.Get("username")
	accessTokenExpiresAt, _ := c.Get("accessTokenExpiresAt")

	expiresAt, _ := accessTokenExpiresAt.(time.Time)
	usernameStr, _ := username.(string)
	c.JSON(http.StatusOK, authResponse{
		User: authUser{
			ID:       userID,
			Username: usernameStr,
		},
		AccessTokenExpiresAt: expiresAt,
	})
}

func setAccessCookie(c *gin.Context, accessToken string, expiresAt time.Time, secure bool) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		auth.AccessCookieName,
		accessToken,
		int(time.Until(expiresAt).Seconds()),
		accessCookiePath,
		"",
		secure,
		true,
	)
}

func clearAccessCookie(c *gin.Context, secure bool) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(auth.AccessCookieName, "", -1, accessCookiePath, "", secure, true)
}

func setRefreshCookie(c *gin.Context, refreshToken string, expiresAt time.Time, secure bool) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		auth.RefreshCookieName,
		refreshToken,
		int(time.Until(expiresAt).Seconds()),
		refreshCookiePath,
		"",
		secure,
		true,
	)
}

func clearRefreshCookie(c *gin.Context, secure bool) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(auth.RefreshCookieName, "", -1, refreshCookiePath, "", secure, true)
}
