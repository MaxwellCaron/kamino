package routes

import (
	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/gin-gonic/gin"
)

func RegisterRoutes(
	r *gin.Engine,
	inventory *handlers.InventoryHandler,
) {
	v1 := r.Group("/api/v1")

	// Health check endpoint for container orchestration
	v1.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Inventory endpoints
	v1.GET("/inventory/tree", inventory.GetTree)
	v1.GET("/inventory/items/:id", inventory.GetItem)
}
