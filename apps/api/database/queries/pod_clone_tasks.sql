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
    state.task_id,
    state.completed,
    state.completed_at
FROM cloned_pod_task_states state
JOIN published_pod_tasks task
  ON task.id = state.task_id
WHERE state.cloned_pod_id = $1
ORDER BY task.sort_order ASC;

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
    q.title,
    q.answer_outline,
    t.pod_id,
    t.title AS task_title,
    p.slug AS pod_slug,
    p.title AS pod_title
FROM published_pod_task_questions q
JOIN published_pod_tasks t
  ON t.id = q.task_id
JOIN published_pods p
  ON p.id = t.pod_id
JOIN cloned_pods cp
  ON cp.pod_id = t.pod_id
WHERE cp.id = sqlc.arg(cloned_pod_id)
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

-- name: UpsertPrincipalPodQuestionAnswer :one
INSERT INTO principal_pod_question_answers (
    principal_id,
    source_pod_id,
    source_task_id,
    source_question_id,
    last_cloned_pod_id,
    pod_slug,
    pod_title,
    task_title,
    question_title,
    answer,
    is_correct,
    answered_at
) VALUES (
    sqlc.arg(principal_id),
    sqlc.arg(source_pod_id),
    sqlc.arg(source_task_id),
    sqlc.arg(source_question_id),
    sqlc.arg(last_cloned_pod_id),
    sqlc.arg(pod_slug),
    sqlc.arg(pod_title),
    sqlc.arg(task_title),
    sqlc.arg(question_title),
    sqlc.arg(answer),
    sqlc.arg(is_correct),
    sqlc.arg(answered_at)
)
ON CONFLICT (principal_id, source_pod_id, source_question_id) DO UPDATE
SET
    last_cloned_pod_id = EXCLUDED.last_cloned_pod_id,
    pod_slug = EXCLUDED.pod_slug,
    pod_title = EXCLUDED.pod_title,
    task_title = EXCLUDED.task_title,
    question_title = EXCLUDED.question_title,
    answer = CASE
        WHEN principal_pod_question_answers.is_correct THEN principal_pod_question_answers.answer
        ELSE EXCLUDED.answer
    END,
    is_correct = principal_pod_question_answers.is_correct OR EXCLUDED.is_correct,
    answered_at = CASE
        WHEN principal_pod_question_answers.is_correct THEN principal_pod_question_answers.answered_at
        ELSE EXCLUDED.answered_at
    END
RETURNING
    source_pod_id,
    source_question_id,
    is_correct,
    answered_at;

-- name: ListPrincipalCorrectPodQuestionAnswers :many
SELECT
    source_pod_id,
    source_question_id,
    answered_at
FROM principal_pod_question_answers
WHERE principal_id = $1
  AND is_correct = true
ORDER BY answered_at ASC, source_pod_id ASC, source_question_id ASC;

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

-- name: RefreshClonedPodTaskStatesForPublishedPod :exec
WITH task_completion AS (
    SELECT
        cp.id AS cloned_pod_id,
        t.id AS task_id,
        NOT EXISTS (
            SELECT 1
            FROM published_pod_task_questions q
            WHERE q.task_id = t.id
              AND NOT EXISTS (
                  SELECT 1
                  FROM cloned_pod_question_answers answer
                  WHERE answer.cloned_pod_id = cp.id
                    AND answer.question_id = q.id
                    AND answer.is_correct = true
              )
        ) AS completed
    FROM cloned_pods cp
    JOIN published_pod_tasks t
      ON t.pod_id = cp.pod_id
    WHERE cp.pod_id = $1
)
INSERT INTO cloned_pod_task_states (
    cloned_pod_id,
    task_id,
    completed,
    completed_at
)
SELECT
    cloned_pod_id,
    task_id,
    completed,
    CASE WHEN completed THEN now() ELSE NULL END
FROM task_completion
ON CONFLICT (cloned_pod_id, task_id) DO UPDATE
SET completed = EXCLUDED.completed,
    completed_at = CASE
        WHEN EXCLUDED.completed AND cloned_pod_task_states.completed THEN cloned_pod_task_states.completed_at
        WHEN EXCLUDED.completed THEN now()
        ELSE NULL
    END;
