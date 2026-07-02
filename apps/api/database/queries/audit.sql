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
WITH action_event_display AS (
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
        COALESCE(ii.name, NULLIF(target_tomb.snapshot->>'name', ''), '') AS inventory_item_name,
        COALESCE(ii.parent_id, NULLIF(target_tomb.snapshot->>'parent_id', '')::UUID) AS inventory_item_parent_id,
        COALESCE(parent.name, NULLIF(target_tomb.snapshot->>'parent_name', ''), '') AS inventory_item_parent_name,
        COALESCE(NULLIF(get_inventory_item_path(ii.id), ''), NULLIF(target_tomb.snapshot->>'path', ''), '')::TEXT AS inventory_item_path,
        COALESCE(pv.node, NULLIF(target_tomb.snapshot->>'node', ''), '') AS inventory_vm_node,
        COALESCE(pv.vmid, NULLIF(target_tomb.snapshot->>'vmid', '')::INTEGER, 0) AS inventory_vm_vmid,
        COALESCE(pp.title, NULLIF(target_tomb.snapshot->>'title', ''), '') AS pod_title,
        COALESCE(pp.slug, NULLIF(target_tomb.snapshot->>'slug', ''), '') AS pod_slug,
        COALESCE(
            NULLIF(get_inventory_item_path(cp.folder_id), ''),
            NULLIF(clone_tomb.snapshot->>'folder_path', ''),
            NULLIF(get_inventory_item_path(pp.source_folder_id), ''),
            NULLIF(target_tomb.snapshot->>'folder_path', ''),
            ''
        )::TEXT AS pod_folder_path
    FROM action_events ae
    LEFT JOIN principals actor
      ON actor.id = ae.actor_principal_id
    LEFT JOIN inventory_items ii
      ON ii.id = ae.inventory_item_id
    LEFT JOIN inventory_items parent
      ON parent.id = ii.parent_id
    LEFT JOIN proxmox_vms pv
      ON pv.inventory_item_id = ae.inventory_item_id
    LEFT JOIN published_pods pp
      ON pp.id = ae.pod_id
    LEFT JOIN LATERAL (
        SELECT CASE
            WHEN COALESCE(ae.metadata->>'clone_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (ae.metadata->>'clone_id')::UUID
        END AS clone_id
    ) clone_ref ON TRUE
    LEFT JOIN cloned_pods cp
      ON cp.id = clone_ref.clone_id
    LEFT JOIN action_target_tombstones clone_tomb
      ON clone_tomb.target_kind = 'pod_clone'
     AND clone_tomb.target_id = clone_ref.clone_id
    LEFT JOIN action_target_tombstones target_tomb
      ON target_tomb.target_kind = ae.target_kind
     AND target_tomb.target_id = CASE
         WHEN ae.target_kind = 'vm' THEN ae.inventory_item_id
         WHEN ae.target_kind = 'folder' THEN ae.inventory_item_id
         WHEN ae.target_kind = 'pod' THEN ae.pod_id
         ELSE NULL
     END
)
SELECT *
FROM action_event_display
WHERE (
    @search::TEXT = ''
    OR actor_username ILIKE '%' || @search::TEXT || '%'
    OR action_kind ILIKE '%' || @search::TEXT || '%'
    OR target_kind ILIKE '%' || @search::TEXT || '%'
    OR status ILIKE '%' || @search::TEXT || '%'
    OR error_message ILIKE '%' || @search::TEXT || '%'
    OR inventory_item_name ILIKE '%' || @search::TEXT || '%'
    OR inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
    OR inventory_item_parent_name ILIKE '%' || @search::TEXT || '%'
    OR inventory_item_path ILIKE '%' || @search::TEXT || '%'
    OR inventory_vm_node ILIKE '%' || @search::TEXT || '%'
    OR inventory_vm_vmid::TEXT ILIKE '%' || @search::TEXT || '%'
    OR pod_id::TEXT ILIKE '%' || @search::TEXT || '%'
    OR pod_title ILIKE '%' || @search::TEXT || '%'
    OR pod_slug ILIKE '%' || @search::TEXT || '%'
    OR pod_folder_path ILIKE '%' || @search::TEXT || '%'
    OR metadata->>'clone_id' ILIKE '%' || @search::TEXT || '%'
)
ORDER BY created_at DESC, id DESC
LIMIT @rows
OFFSET @row_offset;

-- name: CountActionEventsFiltered :one
WITH action_event_display AS (
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
        COALESCE(ii.name, NULLIF(target_tomb.snapshot->>'name', ''), '') AS inventory_item_name,
        COALESCE(ii.parent_id, NULLIF(target_tomb.snapshot->>'parent_id', '')::UUID) AS inventory_item_parent_id,
        COALESCE(parent.name, NULLIF(target_tomb.snapshot->>'parent_name', ''), '') AS inventory_item_parent_name,
        COALESCE(NULLIF(get_inventory_item_path(ii.id), ''), NULLIF(target_tomb.snapshot->>'path', ''), '')::TEXT AS inventory_item_path,
        COALESCE(pv.node, NULLIF(target_tomb.snapshot->>'node', ''), '') AS inventory_vm_node,
        COALESCE(pv.vmid, NULLIF(target_tomb.snapshot->>'vmid', '')::INTEGER, 0) AS inventory_vm_vmid,
        COALESCE(pp.title, NULLIF(target_tomb.snapshot->>'title', ''), '') AS pod_title,
        COALESCE(pp.slug, NULLIF(target_tomb.snapshot->>'slug', ''), '') AS pod_slug,
        COALESCE(
            NULLIF(get_inventory_item_path(cp.folder_id), ''),
            NULLIF(clone_tomb.snapshot->>'folder_path', ''),
            NULLIF(get_inventory_item_path(pp.source_folder_id), ''),
            NULLIF(target_tomb.snapshot->>'folder_path', ''),
            ''
        )::TEXT AS pod_folder_path
    FROM action_events ae
    LEFT JOIN principals actor
      ON actor.id = ae.actor_principal_id
    LEFT JOIN inventory_items ii
      ON ii.id = ae.inventory_item_id
    LEFT JOIN inventory_items parent
      ON parent.id = ii.parent_id
    LEFT JOIN proxmox_vms pv
      ON pv.inventory_item_id = ae.inventory_item_id
    LEFT JOIN published_pods pp
      ON pp.id = ae.pod_id
    LEFT JOIN LATERAL (
        SELECT CASE
            WHEN COALESCE(ae.metadata->>'clone_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (ae.metadata->>'clone_id')::UUID
        END AS clone_id
    ) clone_ref ON TRUE
    LEFT JOIN cloned_pods cp
      ON cp.id = clone_ref.clone_id
    LEFT JOIN action_target_tombstones clone_tomb
      ON clone_tomb.target_kind = 'pod_clone'
     AND clone_tomb.target_id = clone_ref.clone_id
    LEFT JOIN action_target_tombstones target_tomb
      ON target_tomb.target_kind = ae.target_kind
     AND target_tomb.target_id = CASE
         WHEN ae.target_kind = 'vm' THEN ae.inventory_item_id
         WHEN ae.target_kind = 'folder' THEN ae.inventory_item_id
         WHEN ae.target_kind = 'pod' THEN ae.pod_id
         ELSE NULL
     END
)
SELECT count(*)::int
FROM action_event_display
WHERE (
    @search::TEXT = ''
    OR actor_username ILIKE '%' || @search::TEXT || '%'
    OR action_kind ILIKE '%' || @search::TEXT || '%'
    OR target_kind ILIKE '%' || @search::TEXT || '%'
    OR status ILIKE '%' || @search::TEXT || '%'
    OR error_message ILIKE '%' || @search::TEXT || '%'
    OR inventory_item_name ILIKE '%' || @search::TEXT || '%'
    OR inventory_item_id::TEXT ILIKE '%' || @search::TEXT || '%'
    OR inventory_item_parent_name ILIKE '%' || @search::TEXT || '%'
    OR inventory_item_path ILIKE '%' || @search::TEXT || '%'
    OR inventory_vm_node ILIKE '%' || @search::TEXT || '%'
    OR inventory_vm_vmid::TEXT ILIKE '%' || @search::TEXT || '%'
    OR pod_id::TEXT ILIKE '%' || @search::TEXT || '%'
    OR pod_title ILIKE '%' || @search::TEXT || '%'
    OR pod_slug ILIKE '%' || @search::TEXT || '%'
    OR pod_folder_path ILIKE '%' || @search::TEXT || '%'
    OR metadata->>'clone_id' ILIKE '%' || @search::TEXT || '%'
);

-- name: DeleteActionEventsOlderThanRetention :execrows
DELETE FROM action_events
WHERE created_at < now() - INTERVAL '30 days';
