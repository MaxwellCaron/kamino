-- name: CreateAuthSession :exec
INSERT INTO auth_sessions (
    id,
    principal_id,
    token_hash,
    family_id,
    user_agent,
    ip_address,
    expires_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: GetAuthSessionByTokenHashForUpdate :one
SELECT
    id,
    principal_id,
    token_hash,
    family_id,
    replaced_by_session_id,
    user_agent,
    ip_address,
    created_at,
    last_used_at,
    expires_at,
    revoked_at
FROM auth_sessions
WHERE token_hash = $1
FOR UPDATE;

-- name: RevokeAuthSession :exec
UPDATE auth_sessions
SET revoked_at = COALESCE(revoked_at, now())
WHERE id = $1;

-- name: RevokeAuthSessionFamily :execrows
UPDATE auth_sessions
SET revoked_at = COALESCE(revoked_at, now())
WHERE family_id = $1
  AND revoked_at IS NULL;

-- name: RotateAuthSession :exec
UPDATE auth_sessions
SET
    revoked_at = now(),
    replaced_by_session_id = $2,
    user_agent = $3,
    ip_address = $4,
    last_used_at = now()
WHERE id = $1;

-- name: UpdateAuthSessionLastUsed :exec
UPDATE auth_sessions
SET last_used_at = now()
WHERE id = $1;

-- name: IsAuthSessionActive :one
SELECT EXISTS (
    SELECT 1
    FROM auth_sessions
    WHERE id = $1
      AND principal_id = $2
      AND revoked_at IS NULL
      AND expires_at > now()
) AS active;

-- name: IsAuthSessionFamilyActiveForSession :one
-- Validates that the anchor session's family still has an active member.
SELECT EXISTS (
    SELECT 1
    FROM auth_sessions AS anchor
    JOIN auth_sessions AS active
      ON active.family_id = anchor.family_id
     AND active.principal_id = anchor.principal_id
    WHERE anchor.id = $1
      AND anchor.principal_id = $2
      AND active.revoked_at IS NULL
      AND active.expires_at > now()
) AS active;

-- name: RevokeAuthSessionsForPrincipal :execrows
UPDATE auth_sessions
SET revoked_at = COALESCE(revoked_at, now())
WHERE principal_id = $1
  AND revoked_at IS NULL
  AND expires_at > now();

-- name: DeleteExpiredAuthSessions :execrows
DELETE FROM auth_sessions
WHERE auth_sessions.expires_at < sqlc.arg(expired_before);
