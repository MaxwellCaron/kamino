-- name: GetEffectiveInventoryPermissions :one
SELECT gep.allowed_mask::BIGINT AS allowed_mask, gep.denied_mask::BIGINT AS denied_mask
FROM get_effective_permissions(
    sqlc.arg(principal_id),
    sqlc.arg(inventory_item_id)
) AS gep(allowed_mask, denied_mask);

-- name: ListEffectiveManagementPermissionKeys :many
SELECT gep.permission_key::TEXT AS permission_key
FROM get_effective_management_permissions(
    sqlc.arg(principal_id)
) AS gep(permission_key);

-- name: HasInventoryPermission :one
SELECT has_permission(
    sqlc.arg(principal_id),
    sqlc.arg(inventory_item_id),
    sqlc.arg(required_mask)
);

-- name: HasAnyInventoryPermission :one
SELECT EXISTS (
    SELECT 1
    FROM inventory_items ii
    CROSS JOIN LATERAL (
        SELECT
            gep.allowed_mask::BIGINT AS allowed_mask
        FROM get_effective_permissions(sqlc.arg(principal_id), ii.id) AS gep(allowed_mask, denied_mask)
    ) AS perms
    WHERE ii.kind = 'folder'
      AND (perms.allowed_mask & sqlc.arg(required_mask)::BIGINT) = sqlc.arg(required_mask)::BIGINT
);

-- name: ListEffectivePrincipalIDs :many
SELECT ep.principal_id::UUID
FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id);

-- name: GetVisibleInventoryItemsForPrincipal :many
WITH RECURSIVE
effective_principals AS (
    SELECT ep.principal_id FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
)
SELECT
    ii.id,
    ii.parent_id,
    ii.kind,
    ii.name,
    ii.description,
    ii.inherit_permissions,
    ii.vm_limit AS direct_vm_limit,
    (CASE
      WHEN ii.kind = 'folder' THEN COALESCE(inventory_folder_effective_vm_limit(ii.id), 0)
      ELSE 0
    END)::INTEGER AS effective_vm_limit,
    (CASE
      WHEN ii.kind = 'folder' THEN inventory_folder_vm_count(ii.id, NULL)
      ELSE 0
    END)::INTEGER AS vm_count,
    pv.node,
    pv.vmid,
    pv.guest_type,
    pv.is_template,
    pv.notes,
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
    FROM get_effective_permissions_for_set(
        sqlc.arg(principal_id),
        (SELECT array_agg(principal_id) FROM effective_principals),
        ii.id
    ) AS gep(allowed_mask, denied_mask)
) AS perms
WHERE (perms.allowed_mask & 1::BIGINT) = 1::BIGINT
ORDER BY
  CASE WHEN ii.kind = 'folder' THEN 0 ELSE 1 END,
  lower(ii.name) ASC,
  ii.name ASC;

-- name: GetVisibleInventoryTreeForPrincipal :many
WITH RECURSIVE
effective_principals AS (
    SELECT ep.principal_id FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
),
visible_items AS (
    SELECT
        ii.id,
        ii.parent_id,
        ii.kind,
        ii.name,
        ii.description,
        ii.inherit_permissions,
        ii.vm_limit AS direct_vm_limit,
        (CASE
          WHEN ii.kind = 'folder' THEN COALESCE(inventory_folder_effective_vm_limit(ii.id), 0)
          ELSE 0
        END)::INTEGER AS effective_vm_limit,
        (CASE
          WHEN ii.kind = 'folder' THEN inventory_folder_vm_count(ii.id, NULL)
          ELSE 0
        END)::INTEGER AS vm_count,
        pv.node,
        pv.vmid,
        pv.guest_type,
        pv.is_template,
        pv.notes,
        pv.cpu_count,
        pv.memory_mb,
        pv.disk_gb,
        perms.allowed_mask,
        perms.denied_mask,
        1 AS priority
    FROM inventory_items ii
    LEFT JOIN proxmox_vms pv
      ON pv.inventory_item_id = ii.id
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
    WHERE (perms.allowed_mask & 1::BIGINT) = 1::BIGINT
),
ancestors AS (
    SELECT DISTINCT vi.parent_id
    FROM visible_items vi
    WHERE vi.parent_id IS NOT NULL

    UNION

    SELECT ii.parent_id
    FROM inventory_items ii
    JOIN ancestors a ON ii.id = a.parent_id
    WHERE ii.parent_id IS NOT NULL
),
ancestor_rows AS (
    SELECT
        ii.id,
        ii.parent_id,
        ii.kind,
        ii.name,
        ii.description,
        true AS inherit_permissions,
        ii.vm_limit AS direct_vm_limit,
        COALESCE(inventory_folder_effective_vm_limit(ii.id), 0)::INTEGER AS effective_vm_limit,
        inventory_folder_vm_count(ii.id, NULL)::INTEGER AS vm_count,
        NULL::TEXT AS node,
        NULL::INTEGER AS vmid,
        NULL::TEXT AS guest_type,
        NULL::BOOLEAN AS is_template,
        NULL::TEXT AS notes,
        NULL::INTEGER AS cpu_count,
        NULL::INTEGER AS memory_mb,
        NULL::NUMERIC AS disk_gb,
        0::BIGINT AS allowed_mask,
        0::BIGINT AS denied_mask,
        2 AS priority
    FROM inventory_items ii
    WHERE ii.id IN (SELECT parent_id FROM ancestors)
      AND ii.kind = 'folder'
),
combined AS (
    SELECT * FROM visible_items
    UNION ALL
    SELECT * FROM ancestor_rows
)
SELECT DISTINCT ON (id)
    id, parent_id, kind, name, description, inherit_permissions,
    direct_vm_limit, effective_vm_limit, vm_count,
    node, vmid, guest_type, is_template, notes, cpu_count, memory_mb, disk_gb,
    allowed_mask, denied_mask
FROM combined
ORDER BY id, priority;

-- name: GetInventoryItemWithPermissions :one
SELECT
    ii.id,
    ii.parent_id,
    ii.kind,
    ii.name,
    ii.description,
    ii.inherit_permissions,
    ii.vm_limit AS direct_vm_limit,
    (CASE
      WHEN ii.kind = 'folder' THEN COALESCE(inventory_folder_effective_vm_limit(ii.id), 0)
      ELSE 0
    END)::INTEGER AS effective_vm_limit,
    (CASE
      WHEN ii.kind = 'folder' THEN inventory_folder_vm_count(ii.id, NULL)
      ELSE 0
    END)::INTEGER AS vm_count,
    pv.node,
    pv.vmid,
    pv.guest_type,
    pv.is_template,
    pv.notes,
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

-- name: GetInventoryItemsWithPermissions :many
WITH RECURSIVE
effective_principals AS (
    SELECT ep.principal_id FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
)
SELECT
    ii.id,
    ii.parent_id,
    ii.kind,
    ii.name,
    ii.description,
    ii.inherit_permissions,
    ii.vm_limit AS direct_vm_limit,
    (CASE
      WHEN ii.kind = 'folder' THEN COALESCE(inventory_folder_effective_vm_limit(ii.id), 0)
      ELSE 0
    END)::INTEGER AS effective_vm_limit,
    (CASE
      WHEN ii.kind = 'folder' THEN inventory_folder_vm_count(ii.id, NULL)
      ELSE 0
    END)::INTEGER AS vm_count,
    pv.node,
    pv.vmid,
    pv.guest_type,
    pv.is_template,
    pv.notes,
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
    FROM get_effective_permissions_for_set(
        sqlc.arg(principal_id),
        (SELECT array_agg(principal_id) FROM effective_principals),
        ii.id
    ) AS gep(allowed_mask, denied_mask)
) AS perms
WHERE ii.id = ANY(sqlc.arg(item_ids)::UUID[]);

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

-- name: CountInventoryACLEntries :one
SELECT COUNT(*)::BIGINT
FROM inventory_acl_entries;

-- name: ListRootInventoryFolderIDs :many
SELECT id
FROM inventory_items
WHERE parent_id IS NULL
  AND kind = 'folder';

-- name: GetPrincipalGroupsByName :many
SELECT p.id, p.name
FROM principals p
JOIN principal_providers pp
  ON pp.id = p.provider_id
WHERE p.principal_type = 'group'
  AND pp.provider_type <> 'system'
  AND p.name = ANY($1::TEXT[]);

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

-- name: CreateManagementPermissionGrant :exec
INSERT INTO management_permission_grants (
    group_principal_id,
    permission_key
) VALUES ($1, $2)
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

-- name: ListManagementPermissionGrantsForGroup :many
SELECT permission_key
FROM management_permission_grants
WHERE group_principal_id = $1;

-- name: DeleteManagementPermissionGrantsForGroup :exec
DELETE FROM management_permission_grants
WHERE group_principal_id = $1;
