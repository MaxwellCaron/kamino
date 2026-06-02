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
    publisher_principal_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING
    id,
    title,
    slug,
    description,
    image_url,
    status,
    source_folder_id,
    publisher_principal_id,
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
    clone_count,
    created_at,
    updated_at;

-- name: UpdatePublishedPodStatus :exec
UPDATE published_pods
SET status = $2
WHERE id = $1;

-- name: DeletePublishedPod :execrows
DELETE FROM published_pods
WHERE id = $1;

-- name: DeletePublishedPodChildren :exec
DELETE FROM published_pod_tasks
WHERE pod_id = $1;

-- name: DeletePublishedPodCreators :exec
DELETE FROM published_pod_creators
WHERE pod_id = $1;

-- name: DeletePublishedPodAudience :exec
DELETE FROM published_pod_audience
WHERE pod_id = $1;

-- name: DeletePublishedPodVMs :exec
DELETE FROM published_pod_vms
WHERE pod_id = $1;

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
    sort_order
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);

-- name: InsertPublishedPodTask :one
INSERT INTO published_pod_tasks (id, pod_id, title, content, sort_order)
VALUES ($1, $2, $3, $4, $5)
RETURNING id;

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

-- name: ListPublishedPodCreatorsByPodIDs :many
SELECT
    creator.pod_id,
    p.id,
    p.principal_type,
    p.external_id,
    p.name,
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
    created_at,
    updated_at
FROM cloned_pods
WHERE pod_id = $1
  AND user_principal_id = $2;

-- name: GetClonedPodForPrincipalByID :one
SELECT
    id,
    pod_id,
    user_principal_id,
    folder_id,
    created_at,
    updated_at
FROM cloned_pods
WHERE id = $1
  AND user_principal_id = $2;

-- name: InsertClonedPod :one
INSERT INTO cloned_pods (
    id,
    pod_id,
    user_principal_id,
    folder_id
) VALUES ($1, $2, $3, $4)
RETURNING
    id,
    pod_id,
    user_principal_id,
    folder_id,
    created_at,
    updated_at;

-- name: IncrementPublishedPodCloneCount :exec
UPDATE published_pods
SET clone_count = clone_count + 1
WHERE id = $1;

-- name: DecrementPublishedPodCloneCount :exec
UPDATE published_pods
SET clone_count = GREATEST(clone_count - 1, 0)
WHERE id = $1;

-- name: InsertClonedPodVM :exec
INSERT INTO cloned_pod_vms (
    cloned_pod_id,
    published_pod_vm_id,
    inventory_item_id,
    sort_order
) VALUES ($1, $2, $3, $4);

-- name: ListClonedPodVMs :many
SELECT
    cpv.cloned_pod_id,
    cpv.inventory_item_id,
    ii.name,
    pv.node,
    pv.vmid,
    pv.is_template,
    perms.allowed_mask,
    perms.denied_mask,
    cpv.sort_order
FROM cloned_pod_vms cpv
JOIN inventory_items ii
  ON ii.id = cpv.inventory_item_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = cpv.inventory_item_id
CROSS JOIN LATERAL (
    SELECT
        gep.allowed_mask::BIGINT AS allowed_mask,
        gep.denied_mask::BIGINT AS denied_mask
    FROM get_effective_permissions(sqlc.arg(principal_id), ii.id) AS gep(allowed_mask, denied_mask)
) AS perms
WHERE cpv.cloned_pod_id = sqlc.arg(cloned_pod_id)
ORDER BY cpv.sort_order ASC;

-- name: InsertClonedPodTaskState :exec
INSERT INTO cloned_pod_task_states (
    cloned_pod_id,
    task_id,
    completed,
    completed_at
) VALUES (
    $1,
    $2,
    $3,
    CASE WHEN $3 THEN now() ELSE NULL END
)
ON CONFLICT (cloned_pod_id, task_id) DO NOTHING;

-- name: ListClonedPodTaskStates :many
SELECT
    task_id,
    completed,
    completed_at
FROM cloned_pod_task_states
WHERE cloned_pod_id = $1
ORDER BY task_id ASC;

-- name: ListClonedPodQuestionAnswers :many
SELECT
    question_id,
    answer,
    is_correct,
    answered_at
FROM cloned_pod_question_answers
WHERE cloned_pod_id = $1
ORDER BY answered_at ASC;

-- name: GetQuestionForClonedPod :one
SELECT
    q.id,
    q.task_id,
    q.answer_outline
FROM published_pod_task_questions q
JOIN published_pod_tasks t
  ON t.id = q.task_id
JOIN cloned_pods cp
  ON cp.pod_id = t.pod_id
WHERE cp.id = sqlc.arg(cloned_pod_id)
  AND cp.user_principal_id = sqlc.arg(user_principal_id)
  AND q.id = sqlc.arg(question_id);

-- name: UpsertClonedPodQuestionAnswer :one
INSERT INTO cloned_pod_question_answers (
    cloned_pod_id,
    question_id,
    answer,
    is_correct
) VALUES ($1, $2, $3, $4)
ON CONFLICT (cloned_pod_id, question_id) DO UPDATE
SET answer = CASE
        WHEN cloned_pod_question_answers.is_correct THEN cloned_pod_question_answers.answer
        ELSE EXCLUDED.answer
    END,
    is_correct = cloned_pod_question_answers.is_correct OR EXCLUDED.is_correct,
    answered_at = CASE
        WHEN cloned_pod_question_answers.is_correct THEN cloned_pod_question_answers.answered_at
        ELSE now()
    END
RETURNING
    question_id,
    answer,
    is_correct,
    answered_at;

-- name: CountIncorrectOrUnansweredTaskQuestions :one
SELECT COUNT(*)::BIGINT
FROM published_pod_task_questions q
WHERE q.task_id = $2
  AND NOT EXISTS (
      SELECT 1
      FROM cloned_pod_question_answers answer
      WHERE answer.cloned_pod_id = $1
        AND answer.question_id = q.id
        AND answer.is_correct = true
  );

-- name: SetClonedPodTaskCompleted :exec
INSERT INTO cloned_pod_task_states (
    cloned_pod_id,
    task_id,
    completed,
    completed_at
) VALUES (
    sqlc.arg(cloned_pod_id),
    sqlc.arg(task_id),
    sqlc.arg(completed),
    CASE WHEN sqlc.arg(completed)::BOOLEAN THEN now() ELSE NULL END
)
ON CONFLICT (cloned_pod_id, task_id) DO UPDATE
SET completed = EXCLUDED.completed,
    completed_at = CASE
        WHEN EXCLUDED.completed THEN COALESCE(cloned_pod_task_states.completed_at, now())
        ELSE NULL
    END;
