-- name: GetPersonalPodByUser :one
SELECT
    id,
    user_principal_id,
    folder_id,
    network_number,
    created_at,
    updated_at
FROM personal_pods
WHERE user_principal_id = $1;

-- name: InsertPersonalPod :one
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
        folder_id
    )
    SELECT
        candidate.network_number,
        'personal_pod',
        sqlc.arg(folder_id)
    FROM candidate
    RETURNING id, network_number
),
inserted AS (
    INSERT INTO personal_pods (
        id,
        user_principal_id,
        folder_id,
        network_number
    )
    SELECT
        sqlc.arg(id),
        sqlc.arg(user_principal_id),
        sqlc.arg(folder_id),
        allocation.network_number
    FROM allocation
    RETURNING
        id,
        user_principal_id,
        folder_id,
        network_number,
        created_at,
        updated_at
),
_link AS (
    UPDATE pod_network_allocations AS pna
    SET personal_pod_id = inserted.id
    FROM inserted, allocation
    WHERE pna.id = allocation.id
)
SELECT
    id,
    user_principal_id,
    folder_id,
    network_number,
    created_at,
    updated_at
FROM inserted;

-- name: GetPersonalPodForInventoryItem :one
WITH RECURSIVE ancestors AS (
    SELECT inventory_items.id, inventory_items.parent_id
    FROM inventory_items
    WHERE inventory_items.id = $1
    UNION ALL
    SELECT ii.id, ii.parent_id
    FROM inventory_items ii
    JOIN ancestors a ON ii.id = a.parent_id
)
SELECT pp.id, pp.user_principal_id, pp.folder_id, pp.network_number
FROM personal_pods pp
JOIN ancestors a ON pp.folder_id = a.id
LIMIT 1;
