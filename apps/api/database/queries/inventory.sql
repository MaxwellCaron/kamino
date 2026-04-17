-- ---------------------------------------------------------------------------
-- Sync queries
-- ---------------------------------------------------------------------------

-- name: GetRootFolderByName :one
SELECT id
FROM inventory_items
WHERE parent_id IS NULL
  AND kind = 'folder'
  AND name = $1;

-- name: CreateRootFolder :one
INSERT INTO inventory_items (parent_id, kind, name)
VALUES (NULL, 'folder', $1)
RETURNING id;

-- name: GetChildFolderByName :one
SELECT id
FROM inventory_items
WHERE parent_id = $1
  AND kind = 'folder'
  AND name = $2;

-- name: CreateChildFolder :one
INSERT INTO inventory_items (parent_id, kind, name)
VALUES ($1, 'folder', $2)
RETURNING id;

-- name: CreateVMItem :one
INSERT INTO inventory_items (parent_id, kind, name)
VALUES ($1, 'vm', $2)
RETURNING id;

-- name: GetInventoryItemForUpdate :one
SELECT id, parent_id, kind, name, inherit_permissions
FROM inventory_items
WHERE id = $1
FOR UPDATE;

-- name: UpdateInventoryItemParent :exec
UPDATE inventory_items
SET parent_id = $1
WHERE id = $2;

-- name: UpdateInventoryItemName :exec
UPDATE inventory_items
SET name = $1
WHERE id = $2;

-- name: UpdateInventoryItemInheritance :exec
UPDATE inventory_items
SET inherit_permissions = $1
WHERE id = $2;

-- name: NormalizeInventoryItemInheritance :execrows
UPDATE inventory_items
SET inherit_permissions = true
WHERE inherit_permissions = false;

-- name: GetProxmoxVMByNodeVMID :one
SELECT pv.inventory_item_id,
       pv.cpu_count,
       pv.memory_mb,
       pv.disk_gb,
       ii.parent_id,
       ii.name
FROM proxmox_vms pv
JOIN inventory_items ii ON ii.id = pv.inventory_item_id
WHERE pv.node = $1 AND pv.vmid = $2;

-- name: InsertProxmoxVM :exec
INSERT INTO proxmox_vms (inventory_item_id, node, vmid, is_template, cpu_count, memory_mb, disk_gb)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: UpdateProxmoxVM :exec
UPDATE proxmox_vms
SET is_template = $1, cpu_count = $2, memory_mb = $3, disk_gb = $4
WHERE node = $5 AND vmid = $6;

-- name: GetAllProxmoxVMNodeVMIDs :many
SELECT pv.inventory_item_id, pv.node, pv.vmid
FROM proxmox_vms pv;

-- name: DeleteInventoryItem :exec
DELETE FROM inventory_items WHERE id = $1;

-- name: GetChildFolderIDs :many
SELECT id, name
FROM inventory_items
WHERE parent_id = $1
  AND kind = 'folder';

-- name: UpdateInventoryItemNameByProxmoxVM :exec
UPDATE inventory_items SET name = $1
WHERE id = (SELECT inventory_item_id FROM proxmox_vms WHERE node = $2 AND vmid = $3);

-- name: UpdateProxmoxVMIsTemplate :exec
UPDATE proxmox_vms SET is_template = true WHERE node = $1 AND vmid = $2;

-- name: DeleteInventoryItemByProxmoxVM :exec
DELETE FROM inventory_items
WHERE id = (SELECT inventory_item_id FROM proxmox_vms WHERE node = $1 AND vmid = $2);

-- ---------------------------------------------------------------------------
-- Read queries for API endpoints
-- ---------------------------------------------------------------------------

-- name: GetAllInventoryItems :many
SELECT ii.id, ii.parent_id, ii.kind, ii.name,
       pv.node, pv.vmid, pv.is_template, pv.notes, pv.cpu_count, pv.memory_mb, pv.disk_gb
FROM inventory_items ii
LEFT JOIN proxmox_vms pv ON pv.inventory_item_id = ii.id
ORDER BY
  CASE WHEN ii.kind = 'folder' THEN 0 ELSE 1 END,
  lower(ii.name) ASC,
  ii.name ASC;

-- name: GetInventoryItemByID :one
SELECT ii.id, ii.parent_id, ii.kind, ii.name, ii.inherit_permissions,
       pv.node, pv.vmid, pv.is_template, pv.notes, pv.cpu_count, pv.memory_mb, pv.disk_gb
FROM inventory_items ii
LEFT JOIN proxmox_vms pv ON pv.inventory_item_id = ii.id
WHERE ii.id = $1;

-- name: UpdateProxmoxVMNotesByNodeVMID :exec
UPDATE proxmox_vms
SET notes = $1
WHERE node = $2 AND vmid = $3;
