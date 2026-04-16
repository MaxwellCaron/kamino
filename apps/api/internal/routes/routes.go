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
	authz *handlers.AuthorizationHandler,
) {
	v1 := r.Group("/api/v1")
	protected := v1

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
		protected = v1.Group("")
		protected.Use(middleware.Auth(authService))
	}

	// Authenticated: current user info
	if authHandler != nil {
		protected.GET("/auth/me", authHandler.Me)
	}

	// Inventory endpoints
	protected.GET("/inventory/tree", inventory.GetTree)
	protected.GET("/inventory/items/:id", inventory.GetItem)
	protected.GET("/inventory/items/:id/acl", inventory.GetACL)
	protected.PUT("/inventory/items/:id/acl", inventory.UpdateACL)
	protected.POST("/inventory/move", inventory.MoveItem)
	protected.POST("/inventory/folders", inventory.CreateFolder)
	protected.POST("/inventory/folders/:id/rename", inventory.RenameFolder)
	protected.DELETE("/inventory/folders/:id", inventory.DeleteFolder)
	protected.GET("/inventory/events", inventory.StreamEvents)

	// VM endpoints
	protected.GET("/vms/status", vm.GetStatuses)
	protected.GET("/vms/events", vm.StreamEvents)
	protected.POST("/vms/power", vm.PowerAction)
	protected.POST("/vms/rename", vm.RenameVM)
	protected.POST("/vms/clone", vm.CloneVM)
	protected.POST("/vms/template", vm.ConvertToTemplate)
	protected.POST("/vms/snapshot", vm.CreateSnapshot)
	protected.POST("/vms/snapshot/rollback", vm.RollbackSnapshot)
	protected.GET("/vms/:node/:vmid/snapshots", vm.GetSnapshots)
	protected.DELETE("/vms/:node/:vmid/snapshots/:snapname", vm.DeleteSnapshot)
	protected.DELETE("/vms/:node/:vmid", vm.DeleteVM)

	// VM creation & Proxmox metadata endpoints
	protected.POST("/vms", vmCreate.CreateVM)
	protected.GET("/proxmox/nodes", vmCreate.GetNodes)
	protected.GET("/proxmox/create/options", vmCreate.GetCreateOptions)
	protected.GET("/proxmox/create/isos/:storage", vmCreate.GetCreateISOs)
	protected.GET("/proxmox/nodes/:node/storages", vmCreate.GetStorages)
	protected.GET("/proxmox/nodes/:node/storages/:storage/isos", vmCreate.GetISOs)
	protected.GET("/proxmox/nodes/:node/bridges", vmCreate.GetBridges)
	protected.GET("/proxmox/vmid/:vmid/validate", vmCreate.ValidateVMID)
	protected.GET("/proxmox/nextid", vmCreate.GetNextVMID)

	// SDN endpoints
	protected.GET("/sdn/vnets", sdn.GetVNets)
	protected.POST("/sdn/vnets", sdn.CreateVNet)
	protected.DELETE("/sdn/vnets", sdn.DeleteVNets)
	protected.PUT("/sdn/vnets/:vnet", sdn.UpdateVNet)

	// Management authorization endpoints
	if authz != nil {
		protected.GET("/principals/groups/:id/management-access", authz.GetManagementACLForGroup)
		protected.PUT("/principals/groups/:id/management-access", authz.UpdateManagementACLForGroup)
	}

	// Principals endpoints (AD users & groups)
	if principals != nil {
		protected.GET("/principals/users", principals.ListUsers)
		protected.POST("/principals/users", principals.CreateUser)
		protected.DELETE("/principals/users", principals.DeleteUsers)
		protected.PUT("/principals/users/:id", principals.UpdateUser)
		protected.POST("/principals/users/:id/password", principals.SetPassword)
		protected.POST("/principals/users/:id/enable", principals.EnableUser)
		protected.POST("/principals/users/:id/disable", principals.DisableUser)
		protected.GET("/principals/users/:id/groups", principals.GetUserGroups)

		protected.GET("/principals/groups", principals.ListGroups)
		protected.POST("/principals/groups", principals.CreateGroup)
		protected.DELETE("/principals/groups", principals.DeleteGroups)
		protected.PUT("/principals/groups/:id", principals.UpdateGroup)
		protected.GET("/principals/groups/:id/members", principals.GetGroupMembers)
		protected.POST("/principals/groups/:id/members", principals.AddGroupMembers)
		protected.DELETE("/principals/groups/:id/members", principals.RemoveGroupMembers)

		protected.POST("/principals/sync", principals.TriggerSync)
	}

	// VNC proxy endpoints
	protected.POST("/vnc/proxy", vnc.PostProxy)
	protected.GET("/vnc/ws", vnc.WebSocket)
}
