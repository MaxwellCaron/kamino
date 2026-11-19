package httpx

import (
	"net/http"
	"time"

	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/gin-gonic/gin"
)

const (
	accessCookiePath  = "/"
	refreshCookiePath = "/api/v1/auth"
)

func SetAccessCookie(c *gin.Context, accessToken string, expiresAt time.Time, secure bool) {
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

func ClearAccessCookie(c *gin.Context, secure bool) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(auth.AccessCookieName, "", -1, accessCookiePath, "", secure, true)
}

func SetRefreshCookie(c *gin.Context, refreshToken string, expiresAt time.Time, secure bool) {
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

func ClearRefreshCookie(c *gin.Context, secure bool) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(auth.RefreshCookieName, "", -1, refreshCookiePath, "", secure, true)
}
