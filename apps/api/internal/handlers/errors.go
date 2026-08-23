// Convention: handlers never call c.JSON(status, gin.H{"error": ...}) directly.
// - failures with an underlying err  -> writeLoggedError (logs, then responds)
// - validation 400s                  -> writeInvalidRequest
// - permission 403s                  -> writeForbidden
// - missing/invalid auth 401s        -> writeUnauthorized
// Response bodies are static strings; internal error text goes to logs only.
package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func logRequestError(c *gin.Context, operation string, err error) {
	if err == nil {
		return
	}

	path := c.FullPath()
	if path == "" && c.Request != nil && c.Request.URL != nil {
		path = c.Request.URL.Path
	}

	log.Printf("api %s %s %s: %v", c.Request.Method, path, operation, err)
}

func writeLoggedError(
	c *gin.Context,
	status int,
	userMessage string,
	operation string,
	err error,
) {
	logRequestError(c, operation, err)
	c.JSON(status, gin.H{"error": userMessage})
}

func writeInvalidRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, gin.H{"error": message})
}

func writeForbidden(c *gin.Context) {
	c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
}

func writeUnauthorized(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
}

func writeConflict(c *gin.Context, message string) {
	c.JSON(http.StatusConflict, gin.H{"error": message})
}
