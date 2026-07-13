-- name: InsertPodDevNetworkAllocation :one
WITH allocation_lock AS (
    SELECT pg_advisory_xact_lock(740020002)
),
candidate AS (
    SELECT n::INTEGER AS network_number
    FROM allocation_lock,
         generate_series(sqlc.arg(min_network_number)::INTEGER, sqlc.arg(max_network_number)::INTEGER) AS n
    WHERE NOT EXISTS (
        SELECT 1
        FROM cloned_pods cp
        WHERE cp.network_number = n
    )
      AND NOT EXISTS (
        SELECT 1
        FROM pod_dev_network_allocations pdna
        WHERE pdna.network_number = n
    )
    ORDER BY n
    LIMIT 1
)
INSERT INTO pod_dev_network_allocations (
    pod_folder_id,
    network_number,
    network_profile_key
)
SELECT
    sqlc.arg(pod_folder_id),
    candidate.network_number,
    sqlc.arg(network_profile_key)
FROM candidate
RETURNING
    pod_folder_id,
    network_number,
    network_profile_key,
    created_at,
    updated_at;

-- name: GetPodDevNetworkAllocation :one
SELECT
    pod_folder_id,
    network_number,
    network_profile_key,
    created_at,
    updated_at
FROM pod_dev_network_allocations
WHERE pod_folder_id = $1;

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

