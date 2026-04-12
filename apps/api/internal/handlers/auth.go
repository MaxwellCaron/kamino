package handlers

import (
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/principals/activedirectory"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuthHandler struct {
	Auth     *auth.Service
	ADClient *activedirectory.Client
	DB       *pgxpool.Pool
}

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeInvalidRequest(c, "username and password are required")
		return
	}

	// Authenticate against Active Directory
	result, err := h.ADClient.Authenticate(req.Username, req.Password)
	if err != nil {
		writeLoggedError(c, http.StatusUnauthorized, "invalid credentials", "ad authenticate", err)
		return
	}

	// Look up the principal in the database by their AD SID
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

	// Generate JWT pair
	accessToken, refreshToken, err := h.Auth.GenerateTokens(principal.ID, result.Name)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to create session", "generate tokens", err)
		return
	}

	setRefreshCookie(c, refreshToken)
	c.JSON(http.StatusOK, gin.H{
		"access_token": accessToken,
		"user": gin.H{
			"id":       principal.ID,
			"username": result.Name,
		},
	})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	cookie, err := c.Cookie(auth.RefreshCookieName)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no refresh token"})
		return
	}

	claims, err := h.Auth.ValidateToken(cookie)
	if err != nil {
		clearRefreshCookie(c)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}

	// Look up principal to ensure they still exist
	q := database.New(h.DB)
	principal, err := q.GetPrincipalByID(c.Request.Context(), claims.UserIDParsed())
	if err != nil {
		clearRefreshCookie(c)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user no longer exists"})
		return
	}

	username := claims.Username
	if principal.Name != nil {
		username = *principal.Name
	}

	accessToken, refreshToken, err := h.Auth.GenerateTokens(principal.ID, username)
	if err != nil {
		writeLoggedError(c, http.StatusInternalServerError, "failed to create session", "generate tokens", err)
		return
	}

	setRefreshCookie(c, refreshToken)
	c.JSON(http.StatusOK, gin.H{
		"access_token": accessToken,
		"user": gin.H{
			"id":       principal.ID,
			"username": username,
		},
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	clearRefreshCookie(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("userID")
	username, _ := c.Get("username")
	c.JSON(http.StatusOK, gin.H{
		"id":       userID,
		"username": username,
	})
}

func setRefreshCookie(c *gin.Context, refreshToken string) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(auth.RefreshCookieName, refreshToken, int(auth.RefreshTokenDuration.Seconds()), "/api/v1/auth", "", false, true)
}

func clearRefreshCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(auth.RefreshCookieName, "", -1, "/api/v1/auth", "", false, true)
}
