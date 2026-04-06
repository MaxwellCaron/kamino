-- ---------------------------------------------------------------------------
-- Principal provider queries
-- ---------------------------------------------------------------------------

-- name: GetPrincipalProvider :one
SELECT id FROM principal_providers LIMIT 1;

-- name: CreatePrincipalProvider :one
INSERT INTO principal_providers (provider_type, name)
VALUES ($1, $2)
RETURNING id;

-- ---------------------------------------------------------------------------
-- Principal sync queries
-- ---------------------------------------------------------------------------

-- name: UpsertPrincipal :one
INSERT INTO principals (provider_id, principal_type, external_id, name)
VALUES ($1, $2, $3, $4)
ON CONFLICT (provider_id, external_id)
DO UPDATE SET name = EXCLUDED.name, principal_type = EXCLUDED.principal_type
RETURNING id;

-- name: DeleteStalePrincipals :execrows
DELETE FROM principals
WHERE provider_id = $1
  AND external_id != ALL(@kept_external_ids::text[]);

-- ---------------------------------------------------------------------------
-- Group membership sync queries
-- ---------------------------------------------------------------------------

-- name: DeleteGroupMembershipsByProvider :exec
DELETE FROM group_memberships
WHERE group_id IN (
    SELECT id FROM principals
    WHERE provider_id = $1 AND principal_type = 'group'
);

-- name: InsertGroupMembership :exec
INSERT INTO group_memberships (group_id, member_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;
