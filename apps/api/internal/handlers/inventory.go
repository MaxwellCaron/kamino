package handlers

import (
	"errors"
	"net/http"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type InventoryHandler struct {
	DB *pgxpool.Pool
}

// JSON response types

type TreeNode struct {
	ID       uuid.UUID  `json:"id"`
	Name     string     `json:"name"`
	Kind     string     `json:"kind"`
	Children []TreeNode `json:"children,omitempty"`
	VM       *VMDetail  `json:"vm,omitempty"`
}

type VMDetail struct {
	Node       string   `json:"node"`
	VMID       int32    `json:"vmid"`
	IsTemplate bool     `json:"is_template"`
	CPUCount   *int32   `json:"cpu_count,omitempty"`
	MemoryMB   *int32   `json:"memory_mb,omitempty"`
	DiskGB     *float64 `json:"disk_gb,omitempty"`
}

type InventoryItem struct {
	ID                 uuid.UUID  `json:"id"`
	ParentID           *uuid.UUID `json:"parent_id"`
	Kind               string     `json:"kind"`
	Name               string     `json:"name"`
	InheritPermissions bool       `json:"inherit_permissions"`
	VM                 *VMDetail  `json:"vm,omitempty"`
}

// GetTree returns the full inventory tree.
// GET /api/v1/inventory/tree
func (h *InventoryHandler) GetTree(c *gin.Context) {
	q := database.New(h.DB)

	rows, err := q.GetAllInventoryItems(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch inventory"})
		return
	}

	c.JSON(http.StatusOK, buildTree(rows))
}

// GetItem returns a single inventory item with VM details.
// GET /api/v1/inventory/items/:id
func (h *InventoryHandler) GetItem(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	q := database.New(h.DB)
	row, err := q.GetInventoryItemByID(c.Request.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch item"})
		return
	}

	item := InventoryItem{
		ID:                 row.ID,
		ParentID:           row.ParentID,
		Kind:               string(row.Kind),
		Name:               row.Name,
		InheritPermissions: row.InheritPermissions,
	}

	if row.Node != nil {
		item.VM = toVMDetail(row.Node, row.Vmid, row.IsTemplate, row.CpuCount, row.MemoryMb, row.DiskGb)
	}

	c.JSON(http.StatusOK, item)
}

// buildTree converts a flat list of inventory rows into a nested tree.
func buildTree(rows []database.GetAllInventoryItemsRow) []TreeNode {
	nodes := make(map[uuid.UUID]*TreeNode, len(rows))
	childMap := make(map[uuid.UUID][]uuid.UUID, len(rows))
	var rootIDs []uuid.UUID

	for _, row := range rows {
		node := &TreeNode{
			ID:   row.ID,
			Name: row.Name,
			Kind: string(row.Kind),
		}

		if row.Node != nil {
			node.VM = toVMDetail(row.Node, row.Vmid, row.IsTemplate, row.CpuCount, row.MemoryMb, row.DiskGb)
		}

		nodes[row.ID] = node

		if row.ParentID != nil {
			childMap[*row.ParentID] = append(childMap[*row.ParentID], row.ID)
		} else {
			rootIDs = append(rootIDs, row.ID)
		}
	}

	var assemble func(id uuid.UUID) TreeNode
	assemble = func(id uuid.UUID) TreeNode {
		node := *nodes[id]
		if children, ok := childMap[id]; ok {
			node.Children = make([]TreeNode, 0, len(children))
			for _, childID := range children {
				node.Children = append(node.Children, assemble(childID))
			}
		}
		return node
	}

	tree := make([]TreeNode, 0, len(rootIDs))
	for _, id := range rootIDs {
		tree = append(tree, assemble(id))
	}
	return tree
}

func toVMDetail(node *string, vmid *int32, isTemplate *bool, cpuCount, memoryMB *int32, diskGB *float64) *VMDetail {
	vm := &VMDetail{
		CPUCount: cpuCount,
		MemoryMB: memoryMB,
		DiskGB:   diskGB,
	}
	if node != nil {
		vm.Node = *node
	}
	if vmid != nil {
		vm.VMID = *vmid
	}
	if isTemplate != nil {
		vm.IsTemplate = *isTemplate
	}
	return vm
}
