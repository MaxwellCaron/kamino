-- name: GetEffectiveInventoryPermissions :one
SELECT gep.allowed_mask::BIGINT AS allowed_mask, gep.denied_mask::BIGINT AS denied_mask
FROM get_effective_permissions(
    sqlc.arg(principal_id),
    sqlc.arg(inventory_item_id)
) AS gep(allowed_mask, denied_mask);

-- name: HasInventoryPermission :one
SELECT has_permission(
    sqlc.arg(principal_id),
    sqlc.arg(inventory_item_id),
    sqlc.arg(required_mask)
);

-- name: GetVisibleInventoryItemsForPrincipal :many
SELECT
    ii.id,
    ii.parent_id,
    ii.kind,
    ii.name,
    ii.inherit_permissions,
    pv.node,
    pv.vmid,
    pv.is_template,
    pv.cpu_count,
    pv.memory_mb,
    pv.disk_gb,
    perms.allowed_mask,
    perms.denied_mask
FROM inventory_items ii
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ii.id
CROSS JOIN LATERAL (
    SELECT
        gep.allowed_mask::BIGINT AS allowed_mask,
        gep.denied_mask::BIGINT AS denied_mask
    FROM get_effective_permissions(sqlc.arg(principal_id), ii.id) AS gep(allowed_mask, denied_mask)
) AS perms
WHERE (perms.allowed_mask & 1::BIGINT) = 1::BIGINT
ORDER BY
  CASE WHEN ii.kind = 'folder' THEN 0 ELSE 1 END,
  lower(ii.name) ASC,
  ii.name ASC;

-- name: GetInventoryItemWithPermissions :one
SELECT
    ii.id,
    ii.parent_id,
    ii.kind,
    ii.name,
    ii.inherit_permissions,
    pv.node,
    pv.vmid,
    pv.is_template,
    pv.cpu_count,
    pv.memory_mb,
    pv.disk_gb,
    perms.allowed_mask,
    perms.denied_mask
FROM inventory_items ii
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ii.id
CROSS JOIN LATERAL (
    SELECT
        gep.allowed_mask::BIGINT AS allowed_mask,
        gep.denied_mask::BIGINT AS denied_mask
    FROM get_effective_permissions(sqlc.arg(principal_id), ii.id) AS gep(allowed_mask, denied_mask)
) AS perms
WHERE ii.id = sqlc.arg(inventory_item_id);

-- name: GetInventoryItemIDByProxmoxVM :one
SELECT inventory_item_id
FROM proxmox_vms
WHERE node = $1 AND vmid = $2;

-- name: ListVisibleVMIDsForPrincipal :many
SELECT pv.vmid
FROM proxmox_vms pv
JOIN inventory_items ii
  ON ii.id = pv.inventory_item_id
CROSS JOIN LATERAL (
    SELECT
        gep.allowed_mask::BIGINT AS allowed_mask,
        gep.denied_mask::BIGINT AS denied_mask
    FROM get_effective_permissions(sqlc.arg(principal_id), ii.id) AS gep(allowed_mask, denied_mask)
) AS perms
WHERE (perms.allowed_mask & 1::BIGINT) = 1::BIGINT;

-- name: CountInventoryACLEntries :one
SELECT COUNT(*)::BIGINT
FROM inventory_acl_entries;

-- name: ListRootInventoryFolderIDs :many
SELECT id
FROM inventory_items
WHERE parent_id IS NULL
  AND kind = 'folder';

-- name: GetPrincipalGroupsByName :many
SELECT id, name
FROM principals
WHERE principal_type = 'group'
  AND name = ANY($1::TEXT[]);

-- name: CreateInventoryACLEntry :exec
INSERT INTO inventory_acl_entries (
    inventory_item_id,
    principal_id,
    effect,
    permissions,
    applies_to_self,
    applies_to_children,
    inherited_only
) VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT DO NOTHING;
