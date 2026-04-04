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

-- name: UpdateInventoryItemParent :exec
UPDATE inventory_items
SET parent_id = $1
WHERE id = $2;

-- name: UpdateInventoryItemName :exec
UPDATE inventory_items
SET name = $1
WHERE id = $2;

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
INSERT INTO proxmox_vms (inventory_item_id, node, vmid, cpu_count, memory_mb, disk_gb)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: UpdateProxmoxVM :exec
UPDATE proxmox_vms
SET cpu_count = $1, memory_mb = $2, disk_gb = $3
WHERE node = $4 AND vmid = $5;

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
