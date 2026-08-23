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

