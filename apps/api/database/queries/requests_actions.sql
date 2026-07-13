-- name: ApproveRequest :one
UPDATE requests
SET
    status = 'executing',
    reviewer_principal_id = $2,
    reviewed_at = now(),
    execution_started_at = now(),
    canceled_at = NULL,
    execution_error = NULL
WHERE id = $1
  AND status = 'pending'
RETURNING
    id,
    family,
    kind,
    requester_principal_id,
    reviewer_principal_id,
    status,
    reviewed_at,
    execution_started_at,
    executed_at,
    canceled_at,
    execution_error,
    created_at,
    updated_at;

-- name: DenyRequest :one
UPDATE requests
SET
    status = 'denied',
    reviewer_principal_id = $2,
    reviewed_at = now(),
    canceled_at = NULL
WHERE id = $1
  AND status = 'pending'
RETURNING
    id,
    family,
    kind,
    requester_principal_id,
    reviewer_principal_id,
    status,
    reviewed_at,
    executed_at,
    canceled_at,
    execution_error,
    created_at,
    updated_at;

-- name: CancelRequest :one
UPDATE requests
SET
    status = 'canceled',
    canceled_at = now()
WHERE id = $1
  AND status = 'pending'
RETURNING
    id,
    family,
    kind,
    requester_principal_id,
    reviewer_principal_id,
    status,
    reviewed_at,
    executed_at,
    canceled_at,
    execution_error,
    created_at,
    updated_at;

-- name: MarkRequestExecuted :one
UPDATE requests
SET
    status = 'executed',
    executed_at = now(),
    execution_error = NULL
WHERE id = $1
  AND status = 'executing'
RETURNING
    id,
    family,
    kind,
    requester_principal_id,
    reviewer_principal_id,
    status,
    reviewed_at,
    execution_started_at,
    executed_at,
    canceled_at,
    execution_error,
    created_at,
    updated_at;

-- name: MarkRequestExecutionFailed :one
UPDATE requests
SET
    status = 'execution_failed',
    executed_at = now(),
    execution_error = $2
WHERE id = $1
  AND status = 'executing'
RETURNING
    id,
    family,
    kind,
    requester_principal_id,
    reviewer_principal_id,
    status,
    reviewed_at,
    execution_started_at,
    executed_at,
    canceled_at,
    execution_error,
    created_at,
    updated_at;

-- name: ListStaleExecutingRequests :many
SELECT
    id,
    family,
    kind,
    requester_principal_id,
    reviewer_principal_id,
    status,
    reviewed_at,
    execution_started_at,
    executed_at,
    canceled_at,
    execution_error,
    created_at,
    updated_at
FROM requests
WHERE status = 'executing'
  AND execution_started_at IS NOT NULL
  AND execution_started_at < $1
ORDER BY execution_started_at ASC, id ASC;
