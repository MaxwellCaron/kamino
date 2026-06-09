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
	pods *handlers.PodsHandler,
	sdn *handlers.SDNHandler,
	principals *handlers.PrincipalsHandler,
	authz *handlers.AuthorizationHandler,
	requests *handlers.RequestsHandler,
	events *handlers.EventsHandler,
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

	if events != nil {
		protected.GET("/events", events.Stream)
	}

	// Inventory endpoints
	protected.GET("/inventory/tree", inventory.GetTree)
	protected.GET("/inventory/items/:id", inventory.GetItem)
	protected.GET("/inventory/items/:id/acl", inventory.GetACL)
	protected.PUT("/inventory/items/:id/acl", inventory.UpdateACL)
	protected.POST("/inventory/move", inventory.MoveItem)
	protected.POST("/inventory/move/bulk", inventory.MoveItems)
	protected.POST("/inventory/folders", inventory.CreateFolder)
	protected.POST("/inventory/folders/:id/rename", inventory.RenameFolder)
	protected.PUT("/inventory/folders/:id/vm-limit", inventory.UpdateFolderVMLimit)
	protected.DELETE("/inventory/folders/:id", inventory.DeleteFolder)

	// VM endpoints
	protected.GET("/vms/status", vm.GetStatuses)
	protected.POST("/inventory/vms/power", vm.PowerAction)
	protected.POST("/inventory/vms/template", vm.ConvertToTemplate)
	protected.DELETE("/inventory/vms", vm.DeleteVM)
	protected.GET("/inventory/items/:id/vm/resources", vm.GetResources)
	protected.GET("/inventory/items/:id/vm/hardware", vm.GetHardware)
	protected.POST("/inventory/items/:id/vm/rename", vm.RenameVM)
	protected.POST("/inventory/items/:id/vm/clone", vm.CloneVM)
	protected.PUT("/inventory/items/:id/vm/hardware", vm.UpdateHardware)
	protected.PUT("/inventory/items/:id/vm/notes", vm.UpdateNotes)
	protected.POST("/inventory/items/:id/vm/snapshots", vm.CreateSnapshot)
	protected.POST("/inventory/items/:id/vm/snapshots/rollback", vm.RollbackSnapshot)
	protected.GET("/inventory/items/:id/vm/snapshots", vm.GetSnapshots)
	protected.DELETE("/inventory/items/:id/vm/snapshots/:snapname", vm.DeleteSnapshot)

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
	protected.GET("/proxmox/cluster/usage-history", vmCreate.GetClusterUsageHistory)

	// Pod endpoints
	if pods != nil {
		protected.GET("/pods/create/options", pods.GetCreateOptions)
		protected.GET("/pods/create/name-availability", pods.ValidateCreateName)
		protected.GET("/pods/publish/options", pods.GetPublishOptions)
		protected.GET("/pods/published", pods.ListPublished)
		protected.POST("/pods/published", pods.SavePublished)
		protected.GET("/pods/published/progress/:id", pods.GetPublishedProgress)
		protected.GET("/pods/published/:id", pods.GetPublished)
		protected.PUT("/pods/published/:id", pods.SavePublished)
		protected.DELETE("/pods/published/:id", pods.DeletePublished)
		protected.PUT("/pods/published/:id/status", pods.UpdatePublishedStatus)
		protected.GET("/pods/clones/progress/:id", pods.GetCloneProgress)
		protected.POST("/pods/clones/:id/reclone", pods.RecloneClonedPod)
		protected.POST("/pods/clones/:id/power", pods.PowerClonedPod)
		protected.DELETE("/pods/clones/:id", pods.DeleteClonedPod)
		protected.PUT("/pods/clones/:id/questions/:questionID", pods.AnswerClonedPodQuestion)
		protected.GET("/pods/catalog", pods.ListCatalog)
		protected.GET("/pods/catalog/:slug", pods.GetCatalogPod)
		protected.GET("/pods/catalog/:slug/clone", pods.GetCatalogPodClone)
		protected.POST("/pods/catalog/:slug/clone", pods.CloneCatalogPod)
		protected.POST("/pods", pods.Create)
	}

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

	if requests != nil {
		protected.GET("/requests", requests.List)
		protected.GET("/requests/mine", requests.ListMine)
		protected.POST("/requests/inventory/items/:id/vm/power", requests.SubmitInventoryPower)
		protected.POST("/requests/inventory/items/:id/vm/snapshots", requests.SubmitInventorySnapshotCreate)
		protected.POST("/requests/inventory/items/:id/vm/snapshots/rollback", requests.SubmitInventorySnapshotRollback)
		protected.GET("/requests/:id", requests.Get)
		protected.POST("/requests/approve", requests.Approve)
		protected.POST("/requests/deny", requests.Deny)
		protected.POST("/requests/:id/cancel", requests.Cancel)
	}

	// Principals endpoints (AD users & groups)
	if principals != nil {
		protected.GET("/principals/users", principals.ListUsers)
		protected.POST("/principals/users", principals.CreateUser)
		protected.DELETE("/principals/users", principals.DeleteUsers)
		protected.PUT("/principals/users/:id", principals.UpdateUser)
		protected.POST("/principals/users/:id/password", principals.SetPassword)
		protected.POST("/principals/self/password", principals.ChangeOwnPassword)
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
	protected.POST("/inventory/items/:id/vm/vnc/proxy", vnc.PostProxy)
	protected.GET("/vnc/ws", vnc.WebSocket)
}
