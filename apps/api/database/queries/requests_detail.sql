-- name: GetRequestByID :one
SELECT
    r.id,
    r.family,
    r.kind,
    r.requester_principal_id,
    r.reviewer_principal_id,
    r.status,
    r.reviewed_at,
    r.executed_at,
    r.canceled_at,
    r.execution_error,
    r.created_at,
    r.updated_at,
    COALESCE(requester.name, requester.external_id) AS requester_username,
    COALESCE(reviewer.name, reviewer.external_id, '') AS reviewer_username,
    ir.inventory_item_id,
    ir.power_action,
    ir.snapshot_name,
    ii.kind AS inventory_item_kind,
    ii.name AS inventory_item_name,
    ii.parent_id AS inventory_item_parent_id,
    pv.node AS inventory_vm_node,
    pv.vmid AS inventory_vm_vmid,
    pv.is_template AS inventory_vm_is_template
FROM requests r
JOIN principals requester
  ON requester.id = r.requester_principal_id
LEFT JOIN principals reviewer
  ON reviewer.id = r.reviewer_principal_id
LEFT JOIN inventory_requests ir
  ON ir.request_id = r.id
LEFT JOIN inventory_items ii
  ON ii.id = ir.inventory_item_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE r.id = $1;

-- name: GetRequestForExecution :one
SELECT
    r.id,
    r.family,
    r.kind,
    r.requester_principal_id,
    r.reviewer_principal_id,
    r.status,
    r.reviewed_at,
    r.executed_at,
    r.canceled_at,
    r.execution_error,
    r.created_at,
    r.updated_at,
    COALESCE(requester.name, requester.external_id) AS requester_username,
    COALESCE(reviewer.name, reviewer.external_id, '') AS reviewer_username,
    ir.inventory_item_id,
    ir.power_action,
    ir.snapshot_name,
    ii.kind AS inventory_item_kind,
    ii.name AS inventory_item_name,
    ii.parent_id AS inventory_item_parent_id,
    pv.node AS inventory_vm_node,
    pv.vmid AS inventory_vm_vmid,
    pv.is_template AS inventory_vm_is_template
FROM requests r
JOIN principals requester
  ON requester.id = r.requester_principal_id
LEFT JOIN principals reviewer
  ON reviewer.id = r.reviewer_principal_id
LEFT JOIN inventory_requests ir
  ON ir.request_id = r.id
LEFT JOIN inventory_items ii
  ON ii.id = ir.inventory_item_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE r.id = $1
FOR UPDATE OF r;

-- name: ListRequestEventsByRequestID :many
SELECT
    re.id,
    re.request_id,
    re.event_kind,
    re.actor_principal_id,
    re.from_status,
    re.to_status,
    re.error_message,
    re.created_at,
    COALESCE(actor.name, actor.external_id, '') AS actor_username
FROM request_events re
LEFT JOIN principals actor
  ON actor.id = re.actor_principal_id
WHERE re.request_id = $1
ORDER BY re.created_at ASC, re.id ASC;

-- ---------------------------------------------------------------------------
-- Request status updates
-- ---------------------------------------------------------------------------

