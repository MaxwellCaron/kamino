-- ---------------------------------------------------------------------------
-- Request creation
-- ---------------------------------------------------------------------------

-- name: LockRequestRequester :one
SELECT id
FROM principals
WHERE id = $1
FOR UPDATE;

-- name: CountPendingRequestsByRequester :one
SELECT count(*)::int
FROM requests
WHERE requester_principal_id = $1
  AND status = 'pending';

-- name: GetPendingRequestByRequesterAndKind :one
SELECT id
FROM requests
WHERE requester_principal_id = $1
  AND kind = $2
  AND status = 'pending'
LIMIT 1;

-- name: CreateRequest :one
INSERT INTO requests (
    family,
    kind,
    requester_principal_id
) VALUES (
    $1,
    $2,
    $3
)
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

-- name: CreateRequestEvent :one
INSERT INTO request_events (
    request_id,
    event_kind,
    actor_principal_id,
    from_status,
    to_status,
    error_message
) VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6
)
RETURNING
    id,
    request_id,
    event_kind,
    actor_principal_id,
    from_status,
    to_status,
    error_message,
    created_at;

-- name: CreateInventoryRequest :one
INSERT INTO inventory_requests (
    request_id,
    inventory_item_id,
    power_action,
    snapshot_name
) VALUES (
    $1,
    $2,
    $3,
    $4
)
RETURNING
    request_id,
    inventory_item_id,
    power_action,
    snapshot_name,
    created_at;

-- ---------------------------------------------------------------------------
-- Request reads
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Request table reads: page/rows/search (no cursor)
-- ---------------------------------------------------------------------------

