-- name: ListPendingRequestsFiltered :many
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
    parent.name AS inventory_item_parent_name,
    get_inventory_item_path(ii.id) AS inventory_item_path,
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
LEFT JOIN inventory_items parent
  ON parent.id = ii.parent_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE r.status = 'pending'
  AND r.kind = ANY(sqlc.arg(kinds)::TEXT[])
  AND (
      @search::TEXT = ''
      OR r.kind ILIKE '%' || @search::TEXT || '%'
      OR ir.power_action::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ir.snapshot_name ILIKE '%' || @search::TEXT || '%'
      OR r.status::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(requester.name, requester.external_id) ILIKE '%' || @search::TEXT || '%'
      OR r.requester_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(reviewer.name, reviewer.external_id, '') ILIKE '%' || @search::TEXT || '%'
      OR r.reviewer_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ii.name ILIKE '%' || @search::TEXT || '%'
      OR ir.inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR parent.name ILIKE '%' || @search::TEXT || '%'
      OR get_inventory_item_path(ii.id) ILIKE '%' || @search::TEXT || '%'
      OR pv.node ILIKE '%' || @search::TEXT || '%'
      OR pv.vmid::TEXT ILIKE '%' || @search::TEXT || '%'
      OR r.execution_error ILIKE '%' || @search::TEXT || '%'
  )
ORDER BY r.created_at ASC, r.id ASC
LIMIT @rows
OFFSET @row_offset;

-- name: CountPendingRequestsFiltered :one
SELECT count(*)::int
FROM requests r
JOIN principals requester
  ON requester.id = r.requester_principal_id
LEFT JOIN principals reviewer
  ON reviewer.id = r.reviewer_principal_id
LEFT JOIN inventory_requests ir
  ON ir.request_id = r.id
LEFT JOIN inventory_items ii
  ON ii.id = ir.inventory_item_id
LEFT JOIN inventory_items parent
  ON parent.id = ii.parent_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE r.status = 'pending'
  AND r.kind = ANY(sqlc.arg(kinds)::TEXT[])
  AND (
      @search::TEXT = ''
      OR r.kind ILIKE '%' || @search::TEXT || '%'
      OR ir.power_action::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ir.snapshot_name ILIKE '%' || @search::TEXT || '%'
      OR r.status::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(requester.name, requester.external_id) ILIKE '%' || @search::TEXT || '%'
      OR r.requester_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(reviewer.name, reviewer.external_id, '') ILIKE '%' || @search::TEXT || '%'
      OR r.reviewer_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ii.name ILIKE '%' || @search::TEXT || '%'
      OR ir.inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR parent.name ILIKE '%' || @search::TEXT || '%'
      OR get_inventory_item_path(ii.id) ILIKE '%' || @search::TEXT || '%'
      OR pv.node ILIKE '%' || @search::TEXT || '%'
      OR pv.vmid::TEXT ILIKE '%' || @search::TEXT || '%'
      OR r.execution_error ILIKE '%' || @search::TEXT || '%'
  );

-- name: ListCompletedRequestsForKindsFiltered :many
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
    parent.name AS inventory_item_parent_name,
    get_inventory_item_path(ii.id) AS inventory_item_path,
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
LEFT JOIN inventory_items parent
  ON parent.id = ii.parent_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE r.status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed')
  AND r.kind = ANY(sqlc.arg(kinds)::TEXT[])
  AND (
      @search::TEXT = ''
      OR r.kind ILIKE '%' || @search::TEXT || '%'
      OR ir.power_action::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ir.snapshot_name ILIKE '%' || @search::TEXT || '%'
      OR r.status::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(requester.name, requester.external_id) ILIKE '%' || @search::TEXT || '%'
      OR r.requester_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(reviewer.name, reviewer.external_id, '') ILIKE '%' || @search::TEXT || '%'
      OR r.reviewer_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ii.name ILIKE '%' || @search::TEXT || '%'
      OR ir.inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR parent.name ILIKE '%' || @search::TEXT || '%'
      OR get_inventory_item_path(ii.id) ILIKE '%' || @search::TEXT || '%'
      OR pv.node ILIKE '%' || @search::TEXT || '%'
      OR pv.vmid::TEXT ILIKE '%' || @search::TEXT || '%'
      OR r.execution_error ILIKE '%' || @search::TEXT || '%'
  )
ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC
LIMIT @rows
OFFSET @row_offset;

-- name: CountCompletedRequestsForKindsFiltered :one
SELECT count(*)::int
FROM requests r
JOIN principals requester
  ON requester.id = r.requester_principal_id
LEFT JOIN principals reviewer
  ON reviewer.id = r.reviewer_principal_id
LEFT JOIN inventory_requests ir
  ON ir.request_id = r.id
LEFT JOIN inventory_items ii
  ON ii.id = ir.inventory_item_id
LEFT JOIN inventory_items parent
  ON parent.id = ii.parent_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE r.status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed')
  AND r.kind = ANY(sqlc.arg(kinds)::TEXT[])
  AND (
      @search::TEXT = ''
      OR r.kind ILIKE '%' || @search::TEXT || '%'
      OR ir.power_action::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ir.snapshot_name ILIKE '%' || @search::TEXT || '%'
      OR r.status::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(requester.name, requester.external_id) ILIKE '%' || @search::TEXT || '%'
      OR r.requester_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(reviewer.name, reviewer.external_id, '') ILIKE '%' || @search::TEXT || '%'
      OR r.reviewer_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ii.name ILIKE '%' || @search::TEXT || '%'
      OR ir.inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR parent.name ILIKE '%' || @search::TEXT || '%'
      OR get_inventory_item_path(ii.id) ILIKE '%' || @search::TEXT || '%'
      OR pv.node ILIKE '%' || @search::TEXT || '%'
      OR pv.vmid::TEXT ILIKE '%' || @search::TEXT || '%'
      OR r.execution_error ILIKE '%' || @search::TEXT || '%'
  );

-- name: ListPendingRequestsByRequesterFiltered :many
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
    parent.name AS inventory_item_parent_name,
    get_inventory_item_path(ii.id) AS inventory_item_path,
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
LEFT JOIN inventory_items parent
  ON parent.id = ii.parent_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE r.requester_principal_id = $1
  AND r.status = 'pending'
  AND (
      @search::TEXT = ''
      OR r.kind ILIKE '%' || @search::TEXT || '%'
      OR ir.power_action::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ir.snapshot_name ILIKE '%' || @search::TEXT || '%'
      OR r.status::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(requester.name, requester.external_id) ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(reviewer.name, reviewer.external_id, '') ILIKE '%' || @search::TEXT || '%'
      OR r.reviewer_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ii.name ILIKE '%' || @search::TEXT || '%'
      OR ir.inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR parent.name ILIKE '%' || @search::TEXT || '%'
      OR get_inventory_item_path(ii.id) ILIKE '%' || @search::TEXT || '%'
      OR pv.node ILIKE '%' || @search::TEXT || '%'
      OR pv.vmid::TEXT ILIKE '%' || @search::TEXT || '%'
      OR r.execution_error ILIKE '%' || @search::TEXT || '%'
  )
ORDER BY r.created_at DESC, r.id DESC
LIMIT @rows
OFFSET @row_offset;

-- name: CountPendingRequestsByRequesterFiltered :one
SELECT count(*)::int
FROM requests r
JOIN principals requester
  ON requester.id = r.requester_principal_id
LEFT JOIN principals reviewer
  ON reviewer.id = r.reviewer_principal_id
LEFT JOIN inventory_requests ir
  ON ir.request_id = r.id
LEFT JOIN inventory_items ii
  ON ii.id = ir.inventory_item_id
LEFT JOIN inventory_items parent
  ON parent.id = ii.parent_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE r.requester_principal_id = $1
  AND r.status = 'pending'
  AND (
      @search::TEXT = ''
      OR r.kind ILIKE '%' || @search::TEXT || '%'
      OR ir.power_action::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ir.snapshot_name ILIKE '%' || @search::TEXT || '%'
      OR r.status::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(requester.name, requester.external_id) ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(reviewer.name, reviewer.external_id, '') ILIKE '%' || @search::TEXT || '%'
      OR r.reviewer_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ii.name ILIKE '%' || @search::TEXT || '%'
      OR ir.inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR parent.name ILIKE '%' || @search::TEXT || '%'
      OR get_inventory_item_path(ii.id) ILIKE '%' || @search::TEXT || '%'
      OR pv.node ILIKE '%' || @search::TEXT || '%'
      OR pv.vmid::TEXT ILIKE '%' || @search::TEXT || '%'
      OR r.execution_error ILIKE '%' || @search::TEXT || '%'
  );

-- name: ListRequestHistoryByRequesterFiltered :many
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
    parent.name AS inventory_item_parent_name,
    get_inventory_item_path(ii.id) AS inventory_item_path,
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
LEFT JOIN inventory_items parent
  ON parent.id = ii.parent_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE r.requester_principal_id = $1
  AND r.status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed')
  AND (
      @search::TEXT = ''
      OR r.kind ILIKE '%' || @search::TEXT || '%'
      OR ir.power_action::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ir.snapshot_name ILIKE '%' || @search::TEXT || '%'
      OR r.status::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(requester.name, requester.external_id) ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(reviewer.name, reviewer.external_id, '') ILIKE '%' || @search::TEXT || '%'
      OR r.reviewer_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ii.name ILIKE '%' || @search::TEXT || '%'
      OR ir.inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR parent.name ILIKE '%' || @search::TEXT || '%'
      OR get_inventory_item_path(ii.id) ILIKE '%' || @search::TEXT || '%'
      OR pv.node ILIKE '%' || @search::TEXT || '%'
      OR pv.vmid::TEXT ILIKE '%' || @search::TEXT || '%'
      OR r.execution_error ILIKE '%' || @search::TEXT || '%'
  )
ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC
LIMIT @rows
OFFSET @row_offset;

-- name: CountManagerRequestStatuses :one
SELECT
    count(*) FILTER (WHERE status = 'pending')::int AS pending,
    count(*) FILTER (WHERE status = 'approved')::int AS approved,
    count(*) FILTER (WHERE status = 'denied')::int AS denied,
    count(*) FILTER (WHERE status = 'executed')::int AS executed,
    count(*) FILTER (WHERE status = 'execution_failed')::int AS execution_failed
FROM requests
WHERE kind = ANY(sqlc.arg(kinds)::TEXT[]);

-- name: CountRequestHistoryByRequesterFiltered :one
SELECT count(*)::int
FROM requests r
JOIN principals requester
  ON requester.id = r.requester_principal_id
LEFT JOIN principals reviewer
  ON reviewer.id = r.reviewer_principal_id
LEFT JOIN inventory_requests ir
  ON ir.request_id = r.id
LEFT JOIN inventory_items ii
  ON ii.id = ir.inventory_item_id
LEFT JOIN inventory_items parent
  ON parent.id = ii.parent_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE r.requester_principal_id = $1
  AND r.status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed')
  AND (
      @search::TEXT = ''
      OR r.kind ILIKE '%' || @search::TEXT || '%'
      OR ir.power_action::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ir.snapshot_name ILIKE '%' || @search::TEXT || '%'
      OR r.status::TEXT ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(requester.name, requester.external_id) ILIKE '%' || @search::TEXT || '%'
      OR COALESCE(reviewer.name, reviewer.external_id, '') ILIKE '%' || @search::TEXT || '%'
      OR r.reviewer_principal_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR ii.name ILIKE '%' || @search::TEXT || '%'
      OR ir.inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
      OR parent.name ILIKE '%' || @search::TEXT || '%'
      OR get_inventory_item_path(ii.id) ILIKE '%' || @search::TEXT || '%'
      OR pv.node ILIKE '%' || @search::TEXT || '%'
      OR pv.vmid::TEXT ILIKE '%' || @search::TEXT || '%'
      OR r.execution_error ILIKE '%' || @search::TEXT || '%'
  );

