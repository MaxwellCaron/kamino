-- name: ListPublishedPodVMsForClone :many
SELECT
    id,
    pod_id,
    source_inventory_item_id,
    name,
    cpu_count,
    memory_mb,
    disk_gb,
    allow_mask,
    deny_mask,
    is_router,
    segment_key,
    sort_order
FROM published_pod_vms
WHERE pod_id = $1
ORDER BY sort_order ASC;

-- name: GetClonedPodForPrincipalByPodID :one
SELECT
    id,
    pod_id,
    user_principal_id,
    folder_id,
    network_number,
    network_profile_key,
    created_at,
    updated_at
FROM cloned_pods
WHERE pod_id = $1
  AND user_principal_id = $2;

-- name: GetAccessibleClonedPodByPodID :one
SELECT
    cp.id,
    cp.pod_id,
    cp.user_principal_id,
    cp.folder_id,
    cp.network_number,
    cp.network_profile_key,
    cp.created_at,
    cp.updated_at
FROM cloned_pods cp
WHERE cp.pod_id = sqlc.arg(pod_id)
  AND cp.user_principal_id IN (
      SELECT ep.principal_id::UUID
      FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
  )
ORDER BY
    CASE WHEN cp.user_principal_id = sqlc.arg(principal_id) THEN 0 ELSE 1 END,
    cp.created_at DESC
LIMIT 1;

-- name: ListAccessibleClonedPodSummariesByPodIDs :many
SELECT DISTINCT ON (cp.pod_id)
    cp.id,
    cp.pod_id,
    cp.user_principal_id,
    cp.created_at,
    COUNT(DISTINCT task.id)::int AS task_total,
    COUNT(DISTINCT state.task_id) FILTER (WHERE state.completed)::int AS task_completed
FROM cloned_pods cp
LEFT JOIN published_pod_tasks task
  ON task.pod_id = cp.pod_id
LEFT JOIN cloned_pod_task_states state
  ON state.cloned_pod_id = cp.id
 AND state.task_id = task.id
WHERE cp.pod_id = ANY(sqlc.arg(column_1)::UUID[])
  AND cp.user_principal_id IN (
      SELECT ep.principal_id::UUID
      FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
  )
GROUP BY
    cp.id,
    cp.pod_id,
    cp.user_principal_id,
    cp.created_at
ORDER BY
    cp.pod_id,
    CASE WHEN cp.user_principal_id = sqlc.arg(principal_id) THEN 0 ELSE 1 END,
    cp.created_at DESC;

-- name: ListClonedPodSummariesByPodID :many
SELECT
    cp.id,
    cp.pod_id,
    cp.user_principal_id,
    p.principal_type,
    (
    CASE
        WHEN p.full_name IS NULL OR lower(trim(p.full_name)) = lower(COALESCE(NULLIF(trim(p.name), ''), p.external_id))
            THEN COALESCE(NULLIF(trim(p.name), ''), p.external_id)
        ELSE COALESCE(NULLIF(trim(p.name), ''), p.external_id) || ' (' || trim(p.full_name) || ')'
    END
    )::TEXT AS user_label,
    COALESCE(p.description, '') AS user_description,
    cp.folder_id,
    cp.network_number,
    cp.network_profile_key,
    cp.created_at,
    cp.updated_at,
    COUNT(DISTINCT cpv.inventory_item_id)::int AS vm_count,
    COUNT(DISTINCT task.id)::int AS task_total,
    COUNT(DISTINCT state.task_id) FILTER (WHERE state.completed)::int AS task_completed
FROM cloned_pods cp
JOIN principals p
  ON p.id = cp.user_principal_id
LEFT JOIN cloned_pod_vms cpv
  ON cpv.cloned_pod_id = cp.id
LEFT JOIN published_pod_tasks task
  ON task.pod_id = cp.pod_id
LEFT JOIN cloned_pod_task_states state
  ON state.cloned_pod_id = cp.id
 AND state.task_id = task.id
WHERE cp.pod_id = $1
GROUP BY
    cp.id,
    cp.pod_id,
    cp.user_principal_id,
    p.principal_type,
    p.name,
    p.full_name,
    p.external_id,
    p.description,
    cp.folder_id,
    cp.network_number,
    cp.created_at,
    cp.updated_at
ORDER BY cp.created_at DESC;

-- name: ListClonedPodsByPodID :many
SELECT
    id,
    pod_id,
    user_principal_id,
    folder_id,
    network_number,
    network_profile_key,
    created_at,
    updated_at
FROM cloned_pods
WHERE pod_id = $1
ORDER BY created_at DESC;

-- name: GetClonedPodByID :one
SELECT
    id,
    pod_id,
    user_principal_id,
    folder_id,
    network_number,
    network_profile_key,
    created_at,
    updated_at
FROM cloned_pods
WHERE id = $1;

-- name: ListClonedPodRuntimeVMsByCloneIDs :many
SELECT
    cpv.cloned_pod_id,
    cpv.inventory_item_id,
    ii.name,
    pv.node,
    pv.vmid,
    cpv.sort_order
FROM cloned_pod_vms cpv
JOIN inventory_items ii
  ON ii.id = cpv.inventory_item_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = cpv.inventory_item_id
WHERE cpv.cloned_pod_id = ANY(sqlc.arg(clone_ids)::UUID[])
ORDER BY cpv.cloned_pod_id, cpv.sort_order ASC;

-- name: GetClonedPodForPrincipalByID :one
SELECT
    id,
    pod_id,
    user_principal_id,
    folder_id,
    network_number,
    network_profile_key,
    created_at,
    updated_at
FROM cloned_pods
WHERE id = $1
  AND user_principal_id = $2;

-- name: GetAccessibleClonedPodByID :one
SELECT
    cp.id,
    cp.pod_id,
    cp.user_principal_id,
    cp.folder_id,
    cp.network_number,
    cp.network_profile_key,
    cp.created_at,
    cp.updated_at
FROM cloned_pods cp
WHERE cp.id = sqlc.arg(id)
  AND cp.user_principal_id IN (
      SELECT ep.principal_id::UUID
      FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
  );

-- name: InsertClonedPod :one
WITH allocation_lock AS (
    SELECT pg_advisory_xact_lock(740020001)
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
    ORDER BY n
    LIMIT 1
)
INSERT INTO cloned_pods (
    id,
    pod_id,
    user_principal_id,
    folder_id,
    network_number,
    network_profile_key
)
SELECT
    sqlc.arg(id),
    sqlc.arg(pod_id),
    sqlc.arg(user_principal_id),
    sqlc.arg(folder_id),
    candidate.network_number,
    sqlc.arg(network_profile_key)
FROM candidate
RETURNING
    id,
    pod_id,
    user_principal_id,
    folder_id,
    network_number,
    network_profile_key,
    created_at,
    updated_at;

