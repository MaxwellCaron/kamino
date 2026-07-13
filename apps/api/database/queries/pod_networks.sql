-- name: InsertPodDevNetworkAllocation :one
WITH allocation_lock AS (
    SELECT pg_advisory_xact_lock(740020001)
),
candidate AS (
    SELECT n::INTEGER AS network_number
    FROM allocation_lock,
         generate_series(sqlc.arg(min_network_number)::INTEGER, sqlc.arg(max_network_number)::INTEGER) AS n
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
        folder_id
    )
    SELECT
        candidate.network_number,
        'dev_pod',
        sqlc.arg(network_profile_key),
        sqlc.arg(pod_folder_id)
    FROM candidate
    RETURNING
        folder_id,
        network_number,
        network_profile_key,
        created_at,
        updated_at
)
SELECT
    folder_id AS pod_folder_id,
    network_number,
    network_profile_key,
    created_at,
    updated_at
FROM allocation;

-- name: GetPodDevNetworkAllocation :one
SELECT
    folder_id AS pod_folder_id,
    network_number,
    network_profile_key,
    created_at,
    updated_at
FROM pod_network_allocations
WHERE folder_id = $1
  AND kind = 'dev_pod';

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
