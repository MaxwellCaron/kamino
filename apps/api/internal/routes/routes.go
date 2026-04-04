package routes

import "github.com/gin-gonic/gin"

func RegisterRoutes(
	r *gin.Engine,
) {

	v1 := r.Group("/api/v1")

	// Health check endpoint for container orchestration
	v1.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
}
