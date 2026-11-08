// Convention: handlers never call c.JSON(status, gin.H{"error": ...}) directly.
// - failures with an underlying err  -> WriteLoggedError (logs, then responds)
// - validation 400s                  -> WriteInvalidRequest
// - permission 403s                  -> WriteForbidden
// - missing/invalid auth 401s        -> WriteUnauthorized
// Response bodies are static strings; internal error text goes to logs only.
package httpx

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func LogRequestError(c *gin.Context, operation string, err error) {
	if err == nil {
		return
	}

	path := c.FullPath()
	if path == "" && c.Request != nil && c.Request.URL != nil {
		path = c.Request.URL.Path
	}

	log.Printf("api %s %s %s: %v", c.Request.Method, path, operation, err)
}

func WriteLoggedError(
	c *gin.Context,
	status int,
	userMessage string,
	operation string,
	err error,
) {
	LogRequestError(c, operation, err)
	c.JSON(status, gin.H{"error": userMessage})
}

func WriteInvalidRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, gin.H{"error": message})
}

func WriteForbidden(c *gin.Context) {
	c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
}

func WriteUnauthorized(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
}

func WriteConflict(c *gin.Context, message string) {
	c.JSON(http.StatusConflict, gin.H{"error": message})
}

type RequestError struct {
	Status      int
	UserMessage string
	Operation   string
	Err         error
}

func (e *RequestError) Error() string {
	if e == nil {
		return ""
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return e.UserMessage
}

func WriteRequestError(c *gin.Context, reqErr *RequestError) {
	if reqErr == nil {
		return
	}

	if reqErr.Err != nil {
		WriteLoggedError(c, reqErr.Status, reqErr.UserMessage, reqErr.Operation, reqErr.Err)
		return
	}

	c.JSON(reqErr.Status, gin.H{"error": reqErr.UserMessage})
}
