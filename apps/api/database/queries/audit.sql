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
    ii.name AS inventory_item_name,
    ii.parent_id AS inventory_item_parent_id,
    parent.name AS inventory_item_parent_name,
    get_inventory_item_path(ii.id) AS inventory_item_path,
    pv.node AS inventory_vm_node,
    pv.vmid AS inventory_vm_vmid
FROM action_events ae
LEFT JOIN principals actor
  ON actor.id = ae.actor_principal_id
LEFT JOIN inventory_items ii
  ON ii.id = ae.inventory_item_id
LEFT JOIN inventory_items parent
  ON parent.id = ii.parent_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ae.inventory_item_id
WHERE (
    @search::TEXT = ''
    OR COALESCE(actor.name, actor.external_id, '') ILIKE '%' || @search::TEXT || '%'
    OR ae.action_kind ILIKE '%' || @search::TEXT || '%'
    OR ae.target_kind ILIKE '%' || @search::TEXT || '%'
    OR ae.status ILIKE '%' || @search::TEXT || '%'
    OR ae.error_message ILIKE '%' || @search::TEXT || '%'
    OR ii.name ILIKE '%' || @search::TEXT || '%'
    OR ae.inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
    OR parent.name ILIKE '%' || @search::TEXT || '%'
    OR get_inventory_item_path(ii.id) ILIKE '%' || @search::TEXT || '%'
    OR pv.node ILIKE '%' || @search::TEXT || '%'
    OR pv.vmid::TEXT ILIKE '%' || @search::TEXT || '%'
    OR ae.pod_id::TEXT ILIKE '%' || @search::TEXT || '%'
)
ORDER BY ae.created_at DESC, ae.id DESC
LIMIT @rows
OFFSET @row_offset;

-- name: CountActionEventsFiltered :one
SELECT count(*)::int
FROM action_events ae
LEFT JOIN principals actor
  ON actor.id = ae.actor_principal_id
LEFT JOIN inventory_items ii
  ON ii.id = ae.inventory_item_id
LEFT JOIN inventory_items parent
  ON parent.id = ii.parent_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ae.inventory_item_id
WHERE (
    @search::TEXT = ''
    OR COALESCE(actor.name, actor.external_id, '') ILIKE '%' || @search::TEXT || '%'
    OR ae.action_kind ILIKE '%' || @search::TEXT || '%'
    OR ae.target_kind ILIKE '%' || @search::TEXT || '%'
    OR ae.status ILIKE '%' || @search::TEXT || '%'
    OR ae.error_message ILIKE '%' || @search::TEXT || '%'
    OR ii.name ILIKE '%' || @search::TEXT || '%'
    OR ae.inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
    OR parent.name ILIKE '%' || @search::TEXT || '%'
    OR get_inventory_item_path(ii.id) ILIKE '%' || @search::TEXT || '%'
    OR pv.node ILIKE '%' || @search::TEXT || '%'
    OR pv.vmid::TEXT ILIKE '%' || @search::TEXT || '%'
    OR ae.pod_id::TEXT ILIKE '%' || @search::TEXT || '%'
);
