-- ----------------------------------------------------------------------------
-- Direct action audit ledger
-- ----------------------------------------------------------------------------

-- name: InsertActionEvent :one
INSERT INTO action_events (
    actor_principal_id,
    action_kind,
    target_kind,
    inventory_item_id,
    pod_id,
    status,
    error_message,
    metadata
) VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8
)
RETURNING
    id,
    actor_principal_id,
    action_kind,
    target_kind,
    inventory_item_id,
    pod_id,
    status,
    error_message,
    metadata,
    created_at;

-- name: ListActionEventsPaginated :many
SELECT
    ae.id,
    ae.actor_principal_id,
    ae.action_kind,
    ae.target_kind,
    ae.inventory_item_id,
    ae.pod_id,
    ae.status,
    ae.error_message,
    ae.metadata,
    ae.created_at,
    COALESCE(actor.name, actor.external_id, '') AS actor_username,
    ii.name AS inventory_item_name
FROM action_events ae
LEFT JOIN principals actor
  ON actor.id = ae.actor_principal_id
LEFT JOIN inventory_items ii
  ON ii.id = ae.inventory_item_id
WHERE (
    @cursor_created_at::TIMESTAMPTZ IS NULL
    OR ae.created_at < @cursor_created_at
    OR (ae.created_at = @cursor_created_at AND ae.id < @cursor_id::BIGINT)
)
ORDER BY ae.created_at DESC, ae.id DESC
LIMIT @page_size;

-- name: CountActionEvents :one
SELECT count(*)::int
FROM action_events;
