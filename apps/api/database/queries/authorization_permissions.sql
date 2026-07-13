-- name: GetEffectiveInventoryPermissions :one
SELECT gep.allowed_mask::BIGINT AS allowed_mask, gep.denied_mask::BIGINT AS denied_mask
FROM get_effective_permissions(
    sqlc.arg(principal_id),
    sqlc.arg(inventory_item_id)
) AS gep(allowed_mask, denied_mask);

-- name: ListEffectiveManagementPermissionKeys :many
SELECT gep.permission_key::TEXT AS permission_key
FROM get_effective_management_permissions(
    sqlc.arg(principal_id)
) AS gep(permission_key);

-- name: HasInventoryPermission :one
SELECT has_permission(
    sqlc.arg(principal_id),
    sqlc.arg(inventory_item_id),
    sqlc.arg(required_mask)
);

-- name: HasAnyInventoryPermission :one
SELECT EXISTS (
    SELECT 1
    FROM inventory_items ii
    CROSS JOIN LATERAL (
        SELECT
            gep.allowed_mask::BIGINT AS allowed_mask
        FROM get_effective_permissions(sqlc.arg(principal_id), ii.id) AS gep(allowed_mask, denied_mask)
    ) AS perms
    WHERE ii.kind = 'folder'
      AND (perms.allowed_mask & sqlc.arg(required_mask)::BIGINT) = sqlc.arg(required_mask)::BIGINT
);

-- name: ListEffectivePrincipalIDs :many
SELECT ep.principal_id::UUID
FROM get_user_effective_principals(sqlc.arg(principal_id)) AS ep(principal_id);

