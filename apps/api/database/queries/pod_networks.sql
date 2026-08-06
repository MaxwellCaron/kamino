-- name: InsertPodDevNetworkAllocation :one
WITH candidate AS (
    SELECT n::INTEGER AS network_number
    FROM generate_series(sqlc.arg(min_network_number)::INTEGER, sqlc.arg(max_network_number)::INTEGER) AS n
    WHERE NOT EXISTS (
        SELECT 1
        FROM pod_network_allocations pna
        WHERE pna.network_number = n
    )
    ORDER BY n
    LIMIT 1
),
allocation AS (
    INSERT INTO pod_network_allocations (
        network_number,
        kind,
        network_profile_key,
        clone_target_key,
        folder_id
    )
    SELECT
        candidate.network_number,
        'dev_pod',
        sqlc.arg(network_profile_key),
        sqlc.arg(clone_target_key),
        sqlc.arg(pod_folder_id)
    FROM candidate
    RETURNING
        folder_id,
        network_number,
        network_profile_key,
        clone_target_key,
        created_at,
        updated_at
)
SELECT
    folder_id AS pod_folder_id,
    network_number,
    network_profile_key,
    clone_target_key,
    created_at,
    updated_at
FROM allocation;

-- name: GetPodDevNetworkAllocation :one
SELECT
    folder_id AS pod_folder_id,
    network_number,
    network_profile_key,
    clone_target_key,
    created_at,
    updated_at
FROM pod_network_allocations
WHERE folder_id = $1
  AND kind = 'dev_pod';

-- name: GetPodNetworkScopeForInventoryItem :one
WITH RECURSIVE ancestors AS (
    SELECT inventory_items.id, inventory_items.parent_id, 0 AS depth
    FROM inventory_items
    WHERE inventory_items.id = sqlc.arg(inventory_item_id)
    UNION ALL
    SELECT ii.id, ii.parent_id, a.depth + 1
    FROM inventory_items ii
    JOIN ancestors a ON ii.id = a.parent_id
)
SELECT
    pna.kind,
    pna.folder_id,
    pna.network_number,
    pna.network_profile_key,
    pna.clone_target_key,
    pct.lan_vnet,
    pct.dmz_vnet,
    pct.wan_bridge,
    pct.wan_ip_base
FROM pod_network_allocations pna
JOIN ancestors a ON pna.folder_id = a.id
LEFT JOIN pod_clone_targets pct ON pct.key = pna.clone_target_key
WHERE pna.kind IN ('personal_pod', 'dev_pod', 'published_clone')
ORDER BY a.depth ASC
LIMIT 1;

-- name: DeletePodDevVMNetworkAssignments :exec
DELETE FROM pod_dev_vm_network_assignments
WHERE pod_folder_id = $1;

-- name: InsertPodDevVMNetworkAssignment :exec
INSERT INTO pod_dev_vm_network_assignments (
    inventory_item_id,
    pod_folder_id,
    is_router,
    segment_key
) VALUES ($1, $2, $3, $4);

-- name: ListPodDevVMNetworkAssignments :many
SELECT
    inventory_item_id,
    pod_folder_id,
    is_router,
    segment_key,
    created_at,
    updated_at
FROM pod_dev_vm_network_assignments
WHERE pod_folder_id = $1
ORDER BY is_router DESC, created_at ASC;
