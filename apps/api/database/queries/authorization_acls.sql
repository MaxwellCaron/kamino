-- name: CountInventoryACLEntries :one
SELECT COUNT(*)::BIGINT
FROM inventory_acl_entries;

-- name: ListRootInventoryFolderIDs :many
SELECT id
FROM inventory_items
WHERE parent_id IS NULL
  AND kind = 'folder';

-- name: GetPrincipalGroupsByName :many
SELECT p.id, p.name
FROM principals p
JOIN principal_providers pp
  ON pp.id = p.provider_id
WHERE p.principal_type = 'group'
  AND pp.provider_type <> 'system'
  AND p.name = ANY($1::TEXT[]);

-- name: CreateInventoryACLEntry :exec
INSERT INTO inventory_acl_entries (
    inventory_item_id,
    principal_id,
    effect,
    permissions,
    applies_to_self,
    applies_to_children,
    inherited_only
) VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT DO NOTHING;

-- name: CreateManagementPermissionGrant :exec
INSERT INTO management_permission_grants (
    group_principal_id,
    permission_key
) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: ListInventoryACLEntriesForItem :many
SELECT
    ace.id,
    ace.inventory_item_id,
    ace.principal_id,
    p.principal_type,
    p.external_id,
    p.name,
    ace.effect,
    ace.permissions,
    ace.applies_to_self,
    ace.applies_to_children,
    ace.inherited_only
FROM inventory_acl_entries ace
JOIN principals p
  ON p.id = ace.principal_id
WHERE ace.inventory_item_id = $1
ORDER BY
    lower(COALESCE(p.name, p.external_id)) ASC,
    COALESCE(p.name, p.external_id) ASC,
    ace.effect ASC,
    ace.permissions ASC;

-- name: ListInheritedInventoryACLEntriesForItem :many
SELECT
    ace.id,
    chain.ancestor_depth AS ancestor_depth,
    ace.inventory_item_id AS source_item_id,
    source_item.name AS source_item_name,
    ace.principal_id,
    p.principal_type,
    p.external_id,
    p.name,
    ace.effect,
    ace.permissions,
    ace.applies_to_self,
    ace.applies_to_children,
    ace.inherited_only
FROM get_inventory_ancestor_chain($1)
AS chain(inventory_item_id, ancestor_depth, kind, inherit_permissions)
JOIN inventory_acl_entries ace
  ON ace.inventory_item_id = chain.inventory_item_id
JOIN inventory_items source_item
  ON source_item.id = ace.inventory_item_id
JOIN principals p
  ON p.id = ace.principal_id
WHERE chain.ancestor_depth > 0
  AND ace.applies_to_children = true
ORDER BY
    lower(COALESCE(p.name, p.external_id)) ASC,
    COALESCE(p.name, p.external_id) ASC,
    ancestor_depth ASC,
    source_item.name ASC,
    ace.effect ASC,
    ace.permissions ASC;

-- name: DeleteInventoryACLEntriesForItem :exec
DELETE FROM inventory_acl_entries
WHERE inventory_item_id = $1;

-- name: ListManagementPermissionGrantsForGroup :many
SELECT permission_key
FROM management_permission_grants
WHERE group_principal_id = $1;

-- name: DeleteManagementPermissionGrantsForGroup :exec
DELETE FROM management_permission_grants
WHERE group_principal_id = $1;
