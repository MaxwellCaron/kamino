-- name: ListUsedPodNetworkNumbers :many
SELECT network_number
FROM pod_network_allocations;

-- name: ClaimPodNetworkNumber :one
WITH allocation_lock AS (
    SELECT pg_advisory_xact_lock(740020001)
),
conflict AS (
    SELECT 1
    FROM pod_network_allocations
    WHERE network_number = sqlc.arg(network_number)
)
INSERT INTO pod_network_allocations (
    network_number,
    kind,
    network_profile_key,
    folder_id
)
SELECT
    sqlc.arg(network_number),
    sqlc.arg(kind),
    sqlc.arg(network_profile_key),
    sqlc.arg(folder_id)
FROM allocation_lock
WHERE NOT EXISTS (SELECT 1 FROM conflict)
RETURNING
    id,
    network_number,
    kind,
    network_profile_key,
    folder_id,
    inventory_item_id,
    cloned_pod_id,
    personal_pod_id,
    created_at,
    updated_at;

-- name: CompletePodNetworkAllocationInventoryItem :exec
UPDATE pod_network_allocations
SET inventory_item_id = sqlc.arg(inventory_item_id)
WHERE id = sqlc.arg(id);

-- name: ReleasePodNetworkAllocation :exec
DELETE FROM pod_network_allocations
WHERE id = $1
  AND inventory_item_id IS NULL
  AND cloned_pod_id IS NULL
  AND personal_pod_id IS NULL;
