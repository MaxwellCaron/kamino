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

-- name: ListPendingRequests :many
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
WHERE r.status = 'pending'
ORDER BY r.created_at ASC, r.id ASC;

-- name: ListCompletedRequests :many
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
WHERE r.status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed')
ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC;

-- name: ListPendingRequestsByRequester :many
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
WHERE r.requester_principal_id = $1
  AND r.status = 'pending'
ORDER BY r.created_at DESC, r.id DESC;

-- name: ListRequestHistoryByRequester :many
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
WHERE r.requester_principal_id = $1
  AND r.status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed')
ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC;

-- name: ListCompletedRequestsPaginated :many
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
WHERE r.status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed')
  AND (
      @cursor_updated_at::TIMESTAMPTZ IS NULL
      OR r.updated_at < @cursor_updated_at
      OR (r.updated_at = @cursor_updated_at AND r.created_at < @cursor_created_at)
      OR (r.updated_at = @cursor_updated_at AND r.created_at = @cursor_created_at AND r.id < @cursor_id::UUID)
  )
ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC
LIMIT @page_size;

-- name: ListCompletedRequestsForKindsPaginated :many
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
WHERE r.status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed')
  AND r.kind = ANY(sqlc.arg(kinds)::TEXT[])
  AND (
      @cursor_updated_at::TIMESTAMPTZ IS NULL
      OR r.updated_at < @cursor_updated_at
      OR (r.updated_at = @cursor_updated_at AND r.created_at < @cursor_created_at)
      OR (r.updated_at = @cursor_updated_at AND r.created_at = @cursor_created_at AND r.id < @cursor_id::UUID)
  )
ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC
LIMIT @page_size;

-- name: ListRequestHistoryByRequesterPaginated :many
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
WHERE r.requester_principal_id = $1
  AND r.status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed')
  AND (
      @cursor_updated_at::TIMESTAMPTZ IS NULL
      OR r.updated_at < @cursor_updated_at
      OR (r.updated_at = @cursor_updated_at AND r.created_at < @cursor_created_at)
      OR (r.updated_at = @cursor_updated_at AND r.created_at = @cursor_created_at AND r.id < @cursor_id::UUID)
  )
ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC
LIMIT @page_size;

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

-- name: GetInventoryRequestByRequestID :one
SELECT
    ir.request_id,
    ir.inventory_item_id,
    ir.power_action,
    ir.snapshot_name,
    ir.created_at,
    ii.kind AS inventory_item_kind,
    ii.name AS inventory_item_name,
    ii.parent_id AS inventory_item_parent_id,
    pv.node AS inventory_vm_node,
    pv.vmid AS inventory_vm_vmid,
    pv.is_template AS inventory_vm_is_template
FROM inventory_requests ir
JOIN inventory_items ii
  ON ii.id = ir.inventory_item_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = ir.inventory_item_id
WHERE ir.request_id = $1;

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
