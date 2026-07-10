-- ----------------------------------------------------------------------------
-- VM action claims
-- Durable serialization boundary for direct VM mutations.
-- ----------------------------------------------------------------------------

-- name: ClaimVMAction :one
INSERT INTO vm_action_claims (inventory_item_id, action, actor_principal_id, detail)
VALUES ($1, $2, $3, $4)
ON CONFLICT (inventory_item_id) DO NOTHING
RETURNING inventory_item_id, action, actor_principal_id, claimed_at, detail;

-- name: ReleaseVMAction :exec
DELETE FROM vm_action_claims
WHERE inventory_item_id = $1;

-- name: GetVMActionClaim :one
SELECT inventory_item_id, action, actor_principal_id, claimed_at, detail
FROM vm_action_claims
WHERE inventory_item_id = $1;

-- name: DeleteStaleVMActionClaims :execrows
DELETE FROM vm_action_claims
WHERE claimed_at < $1;
