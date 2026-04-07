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
	vmCreate *handlers.VMCreateHandler,
	sdn *handlers.SDNHandler,
	principals *handlers.PrincipalsHandler,
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
	v1.GET("/proxmox/nodes/:node/storages", vmCreate.GetStorages)
	v1.GET("/proxmox/nodes/:node/storages/:storage/isos", vmCreate.GetISOs)
	v1.GET("/proxmox/nodes/:node/bridges", vmCreate.GetBridges)
	v1.GET("/proxmox/nextid", vmCreate.GetNextVMID)

	// SDN endpoints
	v1.GET("/sdn/vnets", sdn.GetVNets)
	v1.POST("/sdn/vnets", sdn.CreateVNet)
	v1.PUT("/sdn/vnets/:vnet", sdn.UpdateVNet)
	v1.DELETE("/sdn/vnets/:vnet", sdn.DeleteVNet)

	// Principals endpoints (AD users & groups)
	if principals != nil {
		v1.GET("/principals/users", principals.ListUsers)
		v1.POST("/principals/users", principals.CreateUser)
		v1.PUT("/principals/users/:id", principals.UpdateUser)
		v1.DELETE("/principals/users/:id", principals.DeleteUser)
		v1.POST("/principals/users/:id/password", principals.SetPassword)
		v1.POST("/principals/users/:id/enable", principals.EnableUser)
		v1.POST("/principals/users/:id/disable", principals.DisableUser)
		v1.GET("/principals/users/:id/groups", principals.GetUserGroups)

		v1.GET("/principals/groups", principals.ListGroups)
		v1.POST("/principals/groups", principals.CreateGroup)
		v1.PUT("/principals/groups/:id", principals.UpdateGroup)
		v1.DELETE("/principals/groups/:id", principals.DeleteGroup)
		v1.GET("/principals/groups/:id/members", principals.GetGroupMembers)
		v1.POST("/principals/groups/:id/members", principals.AddGroupMember)
		v1.DELETE("/principals/groups/:id/members/:mid", principals.RemoveGroupMember)

		v1.POST("/principals/sync", principals.TriggerSync)
	}

	// VNC proxy endpoints
	v1.POST("/vnc/proxy", vnc.PostProxy)
	v1.GET("/vnc/ws", vnc.WebSocket)
}
