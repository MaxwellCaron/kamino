package middleware

import (
	"net/http"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/gin-gonic/gin"
)

// Auth returns a Gin middleware that validates the access token from the
// Authorization header (or "token" query parameter for SSE) and sets
// userID and username in the request context.
func Auth(authService *auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var token string

		if header := c.GetHeader("Authorization"); strings.HasPrefix(header, "Bearer ") {
			token = strings.TrimPrefix(header, "Bearer ")
		} else if q := c.Query("token"); q != "" {
			token = q
		}

		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		claims, err := authService.ValidateToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		c.Set("userID", claims.UserID)
		c.Set("username", claims.Username)
		c.Next()
	}
}
