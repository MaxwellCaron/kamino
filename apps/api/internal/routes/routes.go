package routes

import (
	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/MaxwellCaron/kamino/internal/middleware"
	"github.com/gin-gonic/gin"
)

func RegisterRoutes(
	r *gin.Engine,
	authHandler *handlers.AuthHandler,
	authService *auth.Service,
	inventory *handlers.InventoryHandler,
	vnc *handlers.VNCHandler,
	vm *handlers.VMHandler,
	vmCreate *handlers.VMCreateHandler,
	sdn *handlers.SDNHandler,
	principals *handlers.PrincipalsHandler,
) {
	v1 := r.Group("/api/v1")

	// Health check endpoint for container orchestration
	v1.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Public auth endpoints
	if authHandler != nil {
		authGroup := v1.Group("/auth")
		authGroup.POST("/login", authHandler.Login)
		authGroup.POST("/refresh", authHandler.Refresh)
		authGroup.POST("/logout", authHandler.Logout)
	}

	// Apply auth middleware to all remaining routes when auth is configured
	if authService != nil {
		v1.Use(middleware.Auth(authService))
	}

	// Authenticated: current user info
	if authHandler != nil {
		v1.GET("/auth/me", authHandler.Me)
	}

	// Inventory endpoints
	v1.GET("/inventory/tree", inventory.GetTree)
	v1.GET("/inventory/items/:id", inventory.GetItem)
	v1.POST("/inventory/move", inventory.MoveItem)
	v1.POST("/inventory/folders", inventory.CreateFolder)
	v1.POST("/inventory/folders/:id/rename", inventory.RenameFolder)
	v1.DELETE("/inventory/folders/:id", inventory.DeleteFolder)
	v1.GET("/inventory/events", inventory.StreamEvents)

	// VM endpoints
	v1.GET("/vms/status", vm.GetStatuses)
	v1.GET("/vms/events", vm.StreamEvents)
	v1.POST("/vms/power", vm.PowerAction)
	v1.POST("/vms/rename", vm.RenameVM)
	v1.POST("/vms/clone", vm.CloneVM)
	v1.POST("/vms/template", vm.ConvertToTemplate)
	v1.POST("/vms/snapshot", vm.CreateSnapshot)
	v1.POST("/vms/snapshot/rollback", vm.RollbackSnapshot)
	v1.GET("/vms/:node/:vmid/snapshots", vm.GetSnapshots)
	v1.DELETE("/vms/:node/:vmid/snapshots/:snapname", vm.DeleteSnapshot)
	v1.DELETE("/vms/:node/:vmid", vm.DeleteVM)

	// VM creation & Proxmox metadata endpoints
	v1.POST("/vms", vmCreate.CreateVM)
	v1.GET("/proxmox/nodes", vmCreate.GetNodes)
	v1.GET("/proxmox/create/options", vmCreate.GetCreateOptions)
	v1.GET("/proxmox/create/isos/:storage", vmCreate.GetCreateISOs)
	v1.GET("/proxmox/nodes/:node/storages", vmCreate.GetStorages)
	v1.GET("/proxmox/nodes/:node/storages/:storage/isos", vmCreate.GetISOs)
	v1.GET("/proxmox/nodes/:node/bridges", vmCreate.GetBridges)
	v1.GET("/proxmox/vmid/:vmid/validate", vmCreate.ValidateVMID)
	v1.GET("/proxmox/nextid", vmCreate.GetNextVMID)

	// SDN endpoints
	v1.GET("/sdn/vnets", sdn.GetVNets)
	v1.POST("/sdn/vnets", sdn.CreateVNet)
	v1.DELETE("/sdn/vnets", sdn.DeleteVNets)
	v1.PUT("/sdn/vnets/:vnet", sdn.UpdateVNet)

	// Principals endpoints (AD users & groups)
	if principals != nil {
		v1.GET("/principals/users", principals.ListUsers)
		v1.POST("/principals/users", principals.CreateUser)
		v1.DELETE("/principals/users", principals.DeleteUsers)
		v1.PUT("/principals/users/:id", principals.UpdateUser)
		v1.POST("/principals/users/:id/password", principals.SetPassword)
		v1.POST("/principals/users/:id/enable", principals.EnableUser)
		v1.POST("/principals/users/:id/disable", principals.DisableUser)
		v1.GET("/principals/users/:id/groups", principals.GetUserGroups)

		v1.GET("/principals/groups", principals.ListGroups)
		v1.POST("/principals/groups", principals.CreateGroup)
		v1.DELETE("/principals/groups", principals.DeleteGroups)
		v1.PUT("/principals/groups/:id", principals.UpdateGroup)
		v1.GET("/principals/groups/:id/members", principals.GetGroupMembers)
		v1.POST("/principals/groups/:id/members", principals.AddGroupMembers)
		v1.DELETE("/principals/groups/:id/members", principals.RemoveGroupMembers)

		v1.POST("/principals/sync", principals.TriggerSync)
	}

	// VNC proxy endpoints
	v1.POST("/vnc/proxy", vnc.PostProxy)
	v1.GET("/vnc/ws", vnc.WebSocket)
}
