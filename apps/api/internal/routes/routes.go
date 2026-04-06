package routes

import (
	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/gin-gonic/gin"
)

func RegisterRoutes(
	r *gin.Engine,
	inventory *handlers.InventoryHandler,
	vnc *handlers.VNCHandler,
	vm *handlers.VMHandler,
) {
	v1 := r.Group("/api/v1")

	// Health check endpoint for container orchestration
	v1.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Inventory endpoints
	v1.GET("/inventory/tree", inventory.GetTree)
	v1.GET("/inventory/items/:id", inventory.GetItem)

	// VM endpoints
	v1.GET("/vms/status", vm.GetStatuses)
	v1.POST("/vms/snapshot", vm.CreateSnapshot)

	// VNC proxy endpoints
	v1.POST("/vnc/proxy", vnc.PostProxy)
	v1.GET("/vnc/ws", vnc.WebSocket)
}
