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
WITH allocation_lock AS (
    SELECT pg_advisory_xact_lock(740020003)
),
candidate AS (
    SELECT n::INTEGER AS network_number
    FROM allocation_lock,
         generate_series(sqlc.arg(min_network_number)::INTEGER, sqlc.arg(max_network_number)::INTEGER) AS n
    WHERE NOT EXISTS (
        SELECT 1
        FROM personal_pods pp
        WHERE pp.network_number = n
    )
    ORDER BY n
    LIMIT 1
)
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
    candidate.network_number
FROM candidate
RETURNING
    id,
    user_principal_id,
    folder_id,
    network_number,
    created_at,
    updated_at;

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
