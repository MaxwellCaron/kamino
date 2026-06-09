-- ---------------------------------------------------------------------------
-- Principal provider queries
-- ---------------------------------------------------------------------------

-- name: GetPrincipalProvider :one
SELECT id
FROM principal_providers
WHERE provider_type <> 'system'
LIMIT 1;

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

-- ---------------------------------------------------------------------------
-- Principal CRUD queries
-- ---------------------------------------------------------------------------

-- name: GetAllUsers :many
SELECT id, external_id, name, description, created_at
FROM principals
WHERE provider_id = $1 AND principal_type = 'user'
ORDER BY name;

-- name: GetAllGroups :many
SELECT id, external_id, name, description, created_at
FROM principals
WHERE provider_id = $1 AND principal_type = 'group'
ORDER BY name;

-- name: GetPrincipalByID :one
SELECT id, provider_id, principal_type, external_id, name, description
FROM principals
WHERE id = $1;

-- name: ListPrincipalDeletionBlockers :many
SELECT reserved_principals.principal_id AS principal_id,
       'reserved principal' AS blocker_type,
       reserved_principals.reserved_key::TEXT AS blocker_name
FROM reserved_principals
WHERE reserved_principals.principal_id = $1

UNION ALL

SELECT requests.requester_principal_id AS principal_id,
       'request requester' AS blocker_type,
       requests.kind AS blocker_name
FROM requests
WHERE requests.requester_principal_id = $1

UNION ALL

SELECT requests.reviewer_principal_id AS principal_id,
       'request reviewer' AS blocker_type,
       requests.kind AS blocker_name
FROM requests
WHERE requests.reviewer_principal_id = $1

UNION ALL

SELECT request_events.actor_principal_id AS principal_id,
       'request event actor' AS blocker_type,
       request_events.event_kind::TEXT AS blocker_name
FROM request_events
WHERE request_events.actor_principal_id = $1

UNION ALL

SELECT published_pods.publisher_principal_id AS principal_id,
       'published pod publisher' AS blocker_type,
       published_pods.title AS blocker_name
FROM published_pods
WHERE published_pods.publisher_principal_id = $1

UNION ALL

SELECT published_pod_creators.principal_id AS principal_id,
       'published pod creator' AS blocker_type,
       published_pods.title AS blocker_name
FROM published_pod_creators
JOIN published_pods ON published_pods.id = published_pod_creators.pod_id
WHERE published_pod_creators.principal_id = $1

UNION ALL

SELECT published_pod_audience.principal_id AS principal_id,
       'published pod audience' AS blocker_type,
       published_pods.title AS blocker_name
FROM published_pod_audience
JOIN published_pods ON published_pods.id = published_pod_audience.pod_id
WHERE published_pod_audience.principal_id = $1

UNION ALL

SELECT cloned_pods.user_principal_id AS principal_id,
       'cloned pod owner' AS blocker_type,
       published_pods.title AS blocker_name
FROM cloned_pods
JOIN published_pods ON published_pods.id = cloned_pods.pod_id
WHERE cloned_pods.user_principal_id = $1

ORDER BY blocker_type, blocker_name;

-- name: GetPrincipalsByIDs :many
SELECT id, principal_type
FROM principals
WHERE id = ANY(sqlc.arg(ids)::UUID[]);

-- name: GetPrincipalByExternalID :one
SELECT id, provider_id, principal_type, external_id, name, description
FROM principals
WHERE provider_id = $1 AND external_id = $2;

-- name: UpdatePrincipalDescription :exec
UPDATE principals SET description = $1 WHERE id = $2;

-- name: DeletePrincipal :exec
DELETE FROM principals WHERE id = $1;

-- name: GetGroupMembers :many
SELECT p.id, p.principal_type, p.external_id, p.name, p.description
FROM group_memberships gm
JOIN principals p ON p.id = gm.member_id
WHERE gm.group_id = $1
ORDER BY p.name;

-- name: DeleteGroupMembership :exec
DELETE FROM group_memberships
WHERE group_id = $1 AND member_id = $2;

-- name: GetUserGroups :many
SELECT p.id, p.principal_type, p.external_id, p.name, p.description
FROM group_memberships gm
JOIN principals p ON p.id = gm.group_id
WHERE gm.member_id = $1
ORDER BY p.name;
