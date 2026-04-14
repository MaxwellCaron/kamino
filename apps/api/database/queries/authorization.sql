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

-- name: ListInventoryACLEntriesForItem :many
SELECT
    ace.id,
    ace.inventory_item_id,
    ace.principal_id,
    p.principal_type,
    p.external_id,
    p.name,
    ace.effect,
    ace.permissions,
    ace.applies_to_self,
    ace.applies_to_children,
    ace.inherited_only
FROM inventory_acl_entries ace
JOIN principals p
  ON p.id = ace.principal_id
WHERE ace.inventory_item_id = $1
ORDER BY
    lower(COALESCE(p.name, p.external_id)) ASC,
    COALESCE(p.name, p.external_id) ASC,
    ace.effect ASC,
    ace.permissions ASC;

-- name: ListInheritedInventoryACLEntriesForItem :many
SELECT
    ace.id,
    chain.ancestor_depth AS ancestor_depth,
    ace.inventory_item_id AS source_item_id,
    source_item.name AS source_item_name,
    ace.principal_id,
    p.principal_type,
    p.external_id,
    p.name,
    ace.effect,
    ace.permissions,
    ace.applies_to_self,
    ace.applies_to_children,
    ace.inherited_only
FROM get_inventory_ancestor_chain($1)
AS chain(inventory_item_id, ancestor_depth, kind, inherit_permissions)
JOIN inventory_acl_entries ace
  ON ace.inventory_item_id = chain.inventory_item_id
JOIN inventory_items source_item
  ON source_item.id = ace.inventory_item_id
JOIN principals p
  ON p.id = ace.principal_id
WHERE chain.ancestor_depth > 0
  AND ace.applies_to_children = true
ORDER BY
    lower(COALESCE(p.name, p.external_id)) ASC,
    COALESCE(p.name, p.external_id) ASC,
    ancestor_depth ASC,
    source_item.name ASC,
    ace.effect ASC,
    ace.permissions ASC;

-- name: DeleteInventoryACLEntriesForItem :exec
DELETE FROM inventory_acl_entries
WHERE inventory_item_id = $1;
