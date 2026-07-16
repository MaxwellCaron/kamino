-- name: ListPublishedPods :many
SELECT
    pp.id,
    pp.title,
    pp.slug,
    pp.description,
    pp.image_url,
    pp.status,
    pp.source_folder_id,
    source_folder.name AS source_folder_name,
    pp.publisher_principal_id,
    pp.network_profile_key,
    pp.clone_count,
    pp.created_at,
    pp.updated_at
FROM published_pods pp
JOIN inventory_items source_folder
  ON source_folder.id = pp.source_folder_id
ORDER BY pp.created_at DESC, lower(pp.title) ASC, pp.title ASC;

-- name: ListVisiblePublishedPodsForPrincipal :many
SELECT
    pp.id,
    pp.title,
    pp.slug,
    pp.description,
    pp.image_url,
    pp.status,
    pp.source_folder_id,
    source_folder.name AS source_folder_name,
    pp.publisher_principal_id,
    pp.network_profile_key,
    pp.clone_count,
    pp.created_at,
    pp.updated_at
FROM published_pods pp
JOIN inventory_items source_folder
  ON source_folder.id = pp.source_folder_id
WHERE pp.status = 'listed'
  AND (
      NOT EXISTS (
          SELECT 1
          FROM published_pod_audience audience
          WHERE audience.pod_id = pp.id
      )
      OR EXISTS (
          SELECT 1
          FROM published_pod_audience audience
          WHERE audience.pod_id = pp.id
            AND audience.principal_id IN (
                SELECT ep.principal_id::UUID
                FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
            )
      )
  )
ORDER BY pp.created_at DESC, lower(pp.title) ASC, pp.title ASC;

-- name: GetPublishedPodByID :one
SELECT
    pp.id,
    pp.title,
    pp.slug,
    pp.description,
    pp.image_url,
    pp.status,
    pp.source_folder_id,
    source_folder.name AS source_folder_name,
    pp.publisher_principal_id,
    pp.network_profile_key,
    pp.clone_count,
    pp.created_at,
    pp.updated_at
FROM published_pods pp
JOIN inventory_items source_folder
  ON source_folder.id = pp.source_folder_id
WHERE pp.id = $1;

-- name: GetVisiblePublishedPodBySlug :one
SELECT
    pp.id,
    pp.title,
    pp.slug,
    pp.description,
    pp.image_url,
    pp.status,
    pp.source_folder_id,
    source_folder.name AS source_folder_name,
    pp.publisher_principal_id,
    pp.network_profile_key,
    pp.clone_count,
    pp.created_at,
    pp.updated_at
FROM published_pods pp
JOIN inventory_items source_folder
  ON source_folder.id = pp.source_folder_id
WHERE pp.slug = sqlc.arg(slug)
  AND pp.status = 'listed'
  AND (
      NOT EXISTS (
          SELECT 1
          FROM published_pod_audience audience
          WHERE audience.pod_id = pp.id
      )
      OR EXISTS (
          SELECT 1
          FROM published_pod_audience audience
          WHERE audience.pod_id = pp.id
            AND audience.principal_id IN (
                SELECT ep.principal_id::UUID
                FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id)
            )
      )
  );

-- name: GetPublishedPodSlugConflict :one
SELECT id
FROM published_pods
WHERE slug = $1
  AND id <> $2
LIMIT 1;

-- name: CreatePublishedPod :one
INSERT INTO published_pods (
    id,
    title,
    slug,
    description,
    image_url,
    status,
    source_folder_id,
    publisher_principal_id,
    network_profile_key
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING
    id,
    title,
    slug,
    description,
    image_url,
    status,
    source_folder_id,
    publisher_principal_id,
    network_profile_key,
    clone_count,
    created_at,
    updated_at;

-- name: UpdatePublishedPod :one
UPDATE published_pods
SET title = $2,
    slug = $3,
    description = $4,
    image_url = $5,
    status = $6,
    source_folder_id = $7
WHERE id = $1
RETURNING
    id,
    title,
    slug,
    description,
    image_url,
    status,
    source_folder_id,
    publisher_principal_id,
    network_profile_key,
    clone_count,
    created_at,
    updated_at;

-- name: UpdatePublishedPodStatus :exec
UPDATE published_pods
SET status = $2
WHERE id = $1;

-- name: GetPublishedPodCloneCountForDelete :one
SELECT clone_count
FROM published_pods
WHERE id = $1
FOR UPDATE;

-- name: DeletePublishedPod :execrows
DELETE FROM published_pods
WHERE id = $1;

-- name: DeletePublishedPodTasksExcept :exec
DELETE FROM published_pod_tasks
WHERE pod_id = $1
  AND NOT (id = ANY(sqlc.arg(keep_ids)::UUID[]));

-- name: DeletePublishedPodCreators :exec
DELETE FROM published_pod_creators
WHERE pod_id = $1;

-- name: DeletePublishedPodAudience :exec
DELETE FROM published_pod_audience
WHERE pod_id = $1;

-- name: DeletePublishedPodVMsExcept :exec
DELETE FROM published_pod_vms
WHERE pod_id = $1
  AND NOT (id = ANY(sqlc.arg(keep_ids)::UUID[]));

-- name: InsertPublishedPodCreator :exec
INSERT INTO published_pod_creators (pod_id, principal_id, sort_order)
VALUES ($1, $2, $3);

-- name: InsertPublishedPodAudience :exec
INSERT INTO published_pod_audience (pod_id, principal_id, sort_order)
VALUES ($1, $2, $3);

-- name: InsertPublishedPodVM :exec
INSERT INTO published_pod_vms (
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
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);

-- name: UpdatePublishedPodVM :exec
UPDATE published_pod_vms
SET
    source_inventory_item_id = $3,
    name = $4,
    cpu_count = $5,
    memory_mb = $6,
    disk_gb = $7,
    allow_mask = $8,
    deny_mask = $9,
    is_router = $10,
    segment_key = $11,
    sort_order = $12
WHERE id = $1
  AND pod_id = $2;

-- name: InsertPublishedPodTask :one
INSERT INTO published_pod_tasks (id, pod_id, title, content, sort_order)
VALUES ($1, $2, $3, $4, $5)
RETURNING id;

-- name: OffsetPublishedPodTaskSortOrders :exec
UPDATE published_pod_tasks
SET sort_order = sort_order + sqlc.arg(sort_offset)
WHERE pod_id = sqlc.arg(pod_id);

-- name: UpdatePublishedPodTask :exec
UPDATE published_pod_tasks
SET
    title = $3,
    content = $4,
    sort_order = $5
WHERE id = $1
  AND pod_id = $2;

-- name: InsertPublishedPodTaskQuestion :exec
INSERT INTO published_pod_task_questions (
    id,
    task_id,
    title,
    answer_outline,
    description,
    hint,
    sort_order
) VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: OffsetPublishedPodQuestionSortOrders :exec
UPDATE published_pod_task_questions q
SET sort_order = q.sort_order + sqlc.arg(sort_offset)
FROM published_pod_tasks t
WHERE q.task_id = t.id
  AND t.pod_id = sqlc.arg(pod_id);

-- name: UpdatePublishedPodTaskQuestion :exec
UPDATE published_pod_task_questions
SET
    task_id = $2,
    title = $3,
    answer_outline = $4,
    description = $5,
    hint = $6,
    sort_order = $7
WHERE id = $1;

-- name: DeletePublishedPodQuestionsExcept :exec
DELETE FROM published_pod_task_questions q
USING published_pod_tasks t
WHERE q.task_id = t.id
  AND t.pod_id = $1
  AND NOT (q.id = ANY(sqlc.arg(keep_ids)::UUID[]));

-- name: DeleteClonedPodQuestionAnswersByQuestionID :exec
DELETE FROM cloned_pod_question_answers
WHERE question_id = $1;

-- name: ListPublishedPodCreatorsByPodIDs :many
SELECT
    creator.pod_id,
    p.id,
    p.principal_type,
    p.external_id,
    p.name,
    p.full_name,
    p.description,
    creator.sort_order
FROM published_pod_creators creator
JOIN principals p
  ON p.id = creator.principal_id
WHERE creator.pod_id = ANY(sqlc.arg(pod_ids)::UUID[])
ORDER BY creator.pod_id, creator.sort_order ASC;

-- name: ListPublishedPodAudienceByPodIDs :many
SELECT
    audience.pod_id,
    p.id,
    p.principal_type,
    p.external_id,
    p.name,
    p.full_name,
    p.description,
    audience.sort_order
FROM published_pod_audience audience
JOIN principals p
  ON p.id = audience.principal_id
WHERE audience.pod_id = ANY(sqlc.arg(pod_ids)::UUID[])
ORDER BY audience.pod_id, audience.sort_order ASC;

-- name: ListPublishedPodVMsByPodIDs :many
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
WHERE pod_id = ANY(sqlc.arg(pod_ids)::UUID[])
ORDER BY pod_id, sort_order ASC;

-- name: ListPublishedPodTasksByPodIDs :many
SELECT
    id,
    pod_id,
    title,
    content,
    sort_order
FROM published_pod_tasks
WHERE pod_id = ANY(sqlc.arg(pod_ids)::UUID[])
ORDER BY pod_id, sort_order ASC;

-- name: ListPublishedPodQuestionsByTaskIDs :many
SELECT
    id,
    task_id,
    title,
    answer_outline,
    description,
    hint,
    sort_order
FROM published_pod_task_questions
WHERE task_id = ANY(sqlc.arg(task_ids)::UUID[])
ORDER BY task_id, sort_order ASC;

