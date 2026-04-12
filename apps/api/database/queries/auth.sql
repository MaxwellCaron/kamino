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
    last_used_at = now()
WHERE id = $1;
