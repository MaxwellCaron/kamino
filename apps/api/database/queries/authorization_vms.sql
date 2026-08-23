-- name: GetBulkVMItems :many
SELECT
    ii.id,
    COALESCE(pv.node, '') AS node,
    COALESCE(pv.vmid, 0)::INTEGER AS vmid,
    COALESCE(pv.guest_type, 'qemu') AS guest_type,
    COALESCE(pv.upstream_uuid, '00000000-0000-0000-0000-000000000000'::UUID) AS upstream_uuid,
    (pv.upstream_uuid IS NOT NULL) AS has_vm
FROM inventory_items ii
LEFT JOIN LATERAL (
    SELECT
        proxmox_vms.node,
        proxmox_vms.vmid,
        proxmox_vms.guest_type,
        proxmox_vms.upstream_uuid
    FROM proxmox_vms
    WHERE proxmox_vms.inventory_item_id = ii.id
) AS pv ON TRUE
WHERE ii.id = ANY(sqlc.arg(item_ids)::UUID[]);

-- name: GetBulkVMItemsForUpdate :many
SELECT
    ii.id,
    COALESCE(pv.node, '') AS node,
    COALESCE(pv.vmid, 0)::INTEGER AS vmid,
    COALESCE(pv.guest_type, 'qemu') AS guest_type,
    COALESCE(pv.upstream_uuid, '00000000-0000-0000-0000-000000000000'::UUID) AS upstream_uuid,
    (pv.upstream_uuid IS NOT NULL) AS has_vm
FROM inventory_items ii
LEFT JOIN LATERAL (
    SELECT
        proxmox_vms.node,
        proxmox_vms.vmid,
        proxmox_vms.guest_type,
        proxmox_vms.upstream_uuid
    FROM proxmox_vms
    WHERE proxmox_vms.inventory_item_id = ii.id
    FOR UPDATE
) AS pv ON TRUE
WHERE ii.id = ANY(sqlc.arg(item_ids)::UUID[]);

-- name: GetBulkVMItemsWithPermissions :many
WITH RECURSIVE
effective_principals AS (
    SELECT ep.principal_id FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
)
SELECT
    ii.id,
    COALESCE(pv.node, '') AS node,
    COALESCE(pv.vmid, 0)::INTEGER AS vmid,
    COALESCE(pv.guest_type, 'qemu') AS guest_type,
    COALESCE(pv.upstream_uuid, '00000000-0000-0000-0000-000000000000'::UUID) AS upstream_uuid,
    (pv.upstream_uuid IS NOT NULL) AS has_vm,
    perms.allowed_mask,
    perms.denied_mask
FROM inventory_items ii
LEFT JOIN LATERAL (
    SELECT
        proxmox_vms.node,
        proxmox_vms.vmid,
        proxmox_vms.guest_type,
        proxmox_vms.upstream_uuid
    FROM proxmox_vms
    WHERE proxmox_vms.inventory_item_id = ii.id
) AS pv ON TRUE
CROSS JOIN LATERAL (
    SELECT
        gep.allowed_mask::BIGINT AS allowed_mask,
        gep.denied_mask::BIGINT AS denied_mask
    FROM get_effective_permissions_for_set(
        sqlc.arg(principal_id),
        (SELECT array_agg(principal_id) FROM effective_principals),
        ii.id
    ) AS gep(allowed_mask, denied_mask)
) AS perms
WHERE ii.id = ANY(sqlc.arg(item_ids)::UUID[]);

-- name: GetBulkVMItemsWithPermissionsForUpdate :many
WITH RECURSIVE
effective_principals AS (
    SELECT ep.principal_id FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
)
SELECT
    ii.id,
    COALESCE(pv.node, '') AS node,
    COALESCE(pv.vmid, 0)::INTEGER AS vmid,
    COALESCE(pv.guest_type, 'qemu') AS guest_type,
    COALESCE(pv.upstream_uuid, '00000000-0000-0000-0000-000000000000'::UUID) AS upstream_uuid,
    (pv.upstream_uuid IS NOT NULL) AS has_vm,
    perms.allowed_mask,
    perms.denied_mask
FROM inventory_items ii
LEFT JOIN LATERAL (
    SELECT
        proxmox_vms.node,
        proxmox_vms.vmid,
        proxmox_vms.guest_type,
        proxmox_vms.upstream_uuid
    FROM proxmox_vms
    WHERE proxmox_vms.inventory_item_id = ii.id
    FOR UPDATE
) AS pv ON TRUE
CROSS JOIN LATERAL (
    SELECT
        gep.allowed_mask::BIGINT AS allowed_mask,
        gep.denied_mask::BIGINT AS denied_mask
    FROM get_effective_permissions_for_set(
        sqlc.arg(principal_id),
        (SELECT array_agg(principal_id) FROM effective_principals),
        ii.id
    ) AS gep(allowed_mask, denied_mask)
) AS perms
WHERE ii.id = ANY(sqlc.arg(item_ids)::UUID[]);

-- name: GetInventoryItemIDByProxmoxVM :one
SELECT inventory_item_id
FROM proxmox_vms
WHERE node = $1 AND vmid = $2;

-- name: ListVisibleVMIDsForPrincipal :many
WITH RECURSIVE
effective_principals AS (
    SELECT ep.principal_id FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
)
SELECT pv.vmid
FROM proxmox_vms pv
JOIN inventory_items ii
  ON ii.id = pv.inventory_item_id
CROSS JOIN LATERAL (
    SELECT
        gep.allowed_mask::BIGINT AS allowed_mask,
        gep.denied_mask::BIGINT AS denied_mask
    FROM get_effective_permissions_for_set(
        sqlc.arg(principal_id),
        (SELECT array_agg(principal_id) FROM effective_principals),
        ii.id
    ) AS gep(allowed_mask, denied_mask)
) AS perms
WHERE (perms.allowed_mask & 1::BIGINT) = 1::BIGINT;

