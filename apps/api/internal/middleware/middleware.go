package middleware

import (
	"context"
	"net/http"

	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type accessSessionValidator interface {
	ValidateAccessSession(context.Context, uuid.UUID, uuid.UUID) error
}

// Auth returns a Gin middleware that validates the access token from the
// access-token cookie and sets request auth context.
func Auth(authService *auth.Service, sessionValidator accessSessionValidator) gin.HandlerFunc {
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

		userID, err := claims.PrincipalID()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}
		sessionID, err := claims.SessionIDParsed()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}
		if err := sessionValidator.ValidateAccessSession(c.Request.Context(), sessionID, userID); err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		c.Set("userID", userID)
		c.Set("username", claims.Username)
		if claims.ExpiresAt != nil {
			c.Set("accessTokenExpiresAt", claims.ExpiresAt.Time.UTC())
		}
		c.Request = c.Request.WithContext(authorization.WithPrincipalCache(c.Request.Context()))
		c.Next()
	}
}
