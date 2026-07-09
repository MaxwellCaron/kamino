package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RequireCSRFHeader blocks mutating requests without X-Kamino-Request; /auth routes are exempt.
func RequireCSRFHeader() gin.HandlerFunc {
	return func(c *gin.Context) {
		switch c.Request.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			c.Next()
			return
		}
		if c.GetHeader("X-Kamino-Request") == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "missing required request header"})
			return
		}
		c.Next()
	}
}
