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
SELECT id, parent_id, kind, name, inherit_permissions, vm_limit
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

-- name: UpdateInventoryFolderVMLimit :exec
UPDATE inventory_items
SET vm_limit = $1
WHERE id = $2
  AND kind = 'folder';

-- name: NormalizeInventoryItemInheritance :execrows
UPDATE inventory_items
SET inherit_permissions = true
WHERE inherit_permissions = false;

-- name: GetProxmoxVMByNodeVMID :one
SELECT pv.inventory_item_id,
       pv.node,
       pv.vmid,
       pv.upstream_uuid,
       pv.cpu_count,
       pv.memory_mb,
       pv.disk_gb,
       ii.parent_id,
       ii.name
FROM proxmox_vms pv
JOIN inventory_items ii ON ii.id = pv.inventory_item_id
WHERE pv.node = $1 AND pv.vmid = $2;

-- name: GetProxmoxVMByUpstreamUUID :one
SELECT pv.inventory_item_id,
       pv.node,
       pv.vmid,
       pv.upstream_uuid,
       pv.cpu_count,
       pv.memory_mb,
       pv.disk_gb,
       ii.parent_id,
       ii.name
FROM proxmox_vms pv
JOIN inventory_items ii ON ii.id = pv.inventory_item_id
WHERE pv.upstream_uuid = $1;

-- name: GetProxmoxVMByInventoryItemID :one
SELECT inventory_item_id,
       node,
       vmid,
       upstream_uuid,
       is_template,
       notes,
       cpu_count,
       memory_mb,
       disk_gb
FROM proxmox_vms
WHERE inventory_item_id = $1;

-- name: GetProxmoxVMByInventoryItemIDForUpdate :one
SELECT inventory_item_id,
       node,
       vmid,
       upstream_uuid,
       is_template,
       notes,
       cpu_count,
       memory_mb,
       disk_gb
FROM proxmox_vms
WHERE inventory_item_id = $1
FOR UPDATE;

-- name: InsertProxmoxVM :exec
INSERT INTO proxmox_vms (inventory_item_id, node, vmid, upstream_uuid, is_template, cpu_count, memory_mb, disk_gb)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: UpdateProxmoxVM :exec
UPDATE proxmox_vms
SET node = $2,
    vmid = $3,
    upstream_uuid = $4,
    is_template = $5,
    cpu_count = $6,
    memory_mb = $7,
    disk_gb = $8
WHERE inventory_item_id = $1;

-- name: GetAllProxmoxVMNodeVMIDs :many
SELECT pv.inventory_item_id, pv.node, pv.vmid
FROM proxmox_vms pv;

-- name: DeleteInventoryItem :exec
DELETE FROM inventory_items WHERE id = $1;

-- name: ListInventoryDeletionBlockersInSubtree :many
WITH RECURSIVE subtree AS (
    SELECT inventory_items.id
    FROM inventory_items
    WHERE inventory_items.id = $1

    UNION ALL

    SELECT child.id
    FROM inventory_items child
    JOIN subtree parent ON child.parent_id = parent.id
)
SELECT pp.source_folder_id AS inventory_item_id,
       'published pod source folder' AS blocker_type,
       pp.title AS blocker_name
FROM published_pods pp
WHERE pp.source_folder_id IN (SELECT id FROM subtree)

UNION ALL

SELECT ppv.source_inventory_item_id AS inventory_item_id,
       'published pod VM' AS blocker_type,
       pp.title || ' / ' || ppv.name AS blocker_name
FROM published_pod_vms ppv
JOIN published_pods pp ON pp.id = ppv.pod_id
WHERE ppv.source_inventory_item_id IN (SELECT id FROM subtree)

UNION ALL

SELECT ir.inventory_item_id AS inventory_item_id,
       'inventory request' AS blocker_type,
       r.kind AS blocker_name
FROM inventory_requests ir
JOIN requests r ON r.id = ir.request_id
WHERE ir.inventory_item_id IN (SELECT id FROM subtree)
ORDER BY blocker_type, lower(blocker_name);

-- name: GetChildFolderIDs :many
SELECT id, name
FROM inventory_items
WHERE parent_id = $1
  AND kind = 'folder';

-- name: UpdateProxmoxVMIsTemplateByItemID :exec
UPDATE proxmox_vms
SET is_template = true
WHERE inventory_item_id = $1;

-- name: UpdateProxmoxVMHardwareSummaryByItemID :exec
UPDATE proxmox_vms
SET cpu_count = $1,
    memory_mb = $2,
    disk_gb = $3
WHERE inventory_item_id = $4;

-- ---------------------------------------------------------------------------
-- Read queries for API endpoints
-- ---------------------------------------------------------------------------

-- name: GetAllInventoryItems :many
SELECT ii.id, ii.parent_id, ii.kind, ii.name,
       ii.vm_limit AS direct_vm_limit,
       (CASE
         WHEN ii.kind = 'folder' THEN COALESCE(inventory_folder_effective_vm_limit(ii.id), 0)
         ELSE 0
       END)::INTEGER AS effective_vm_limit,
       (CASE
         WHEN ii.kind = 'folder' THEN inventory_folder_vm_count(ii.id, NULL)
         ELSE 0
       END)::INTEGER AS vm_count,
       pv.node, pv.vmid, pv.is_template, pv.notes, pv.cpu_count, pv.memory_mb, pv.disk_gb
FROM inventory_items ii
LEFT JOIN proxmox_vms pv ON pv.inventory_item_id = ii.id
ORDER BY
  CASE WHEN ii.kind = 'folder' THEN 0 ELSE 1 END,
  lower(ii.name) ASC,
  ii.name ASC;

-- name: GetInventoryItemByID :one
SELECT ii.id, ii.parent_id, ii.kind, ii.name, ii.inherit_permissions,
       ii.vm_limit AS direct_vm_limit,
       (CASE
         WHEN ii.kind = 'folder' THEN COALESCE(inventory_folder_effective_vm_limit(ii.id), 0)
         ELSE 0
       END)::INTEGER AS effective_vm_limit,
       (CASE
         WHEN ii.kind = 'folder' THEN inventory_folder_vm_count(ii.id, NULL)
         ELSE 0
       END)::INTEGER AS vm_count,
       pv.node, pv.vmid, pv.is_template, pv.notes, pv.cpu_count, pv.memory_mb, pv.disk_gb
FROM inventory_items ii
LEFT JOIN proxmox_vms pv ON pv.inventory_item_id = ii.id
WHERE ii.id = $1;

-- name: UpdateProxmoxVMNotesByItemID :exec
UPDATE proxmox_vms
SET notes = $1
WHERE inventory_item_id = $2;
