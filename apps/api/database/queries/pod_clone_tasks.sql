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

-- name: UpsertPrincipalPodQuestionAnswer :exec
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
    is_correct
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
    sqlc.arg(is_correct)
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
        ELSE now()
    END;

-- name: ListPrincipalPodQuestionAnswers :many
-- Answers for questions that no longer exist in the pod are skipped.
SELECT
    question.id AS question_id,
    saved.answer,
    saved.is_correct,
    saved.answered_at
FROM principal_pod_question_answers saved
JOIN published_pod_task_questions question
  ON question.id = saved.source_question_id
JOIN published_pod_tasks task
  ON task.id = question.task_id
WHERE saved.principal_id = sqlc.arg(principal_id)
  AND task.pod_id = sqlc.arg(pod_id)
ORDER BY saved.answered_at ASC;

-- name: ListPrincipalCorrectPodQuestionAnswers :many
SELECT
    source_pod_id,
    source_question_id,
    answered_at
FROM principal_pod_question_answers
WHERE principal_id = $1
  AND is_correct = true
ORDER BY answered_at ASC, source_pod_id ASC, source_question_id ASC;
