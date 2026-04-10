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
