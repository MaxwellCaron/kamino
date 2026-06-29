package middleware

import (
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
)

// Auth returns a Gin middleware that validates the access token from the
// access-token cookie and sets request auth context.
func Auth(authService *auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, _ := c.Cookie(auth.AccessCookieName)

		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		claims, err := authService.ValidateAccessToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		userID, _ := claims.PrincipalID()
		c.Set("userID", userID)
		c.Set("username", claims.Username)
		if claims.ExpiresAt != nil {
			c.Set("accessTokenExpiresAt", claims.ExpiresAt.Time.UTC())
		}
		c.Request = c.Request.WithContext(authorization.WithPrincipalCache(c.Request.Context()))
		c.Next()
	}
}
