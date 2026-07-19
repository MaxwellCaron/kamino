-- ----------------------------------------------------------------------------
-- Pod clone claims
-- Durable serialization boundary for pod clone/reclone/delete operations.
-- ----------------------------------------------------------------------------

-- name: ClaimPodClone :one
WITH pod_lock AS MATERIALIZED (
    SELECT pg_advisory_xact_lock(hashtextextended(sqlc.arg(pod_id)::UUID::TEXT, 740020004))
),
conflicting_claim AS (
    SELECT 1
    FROM pod_clone_claims existing
    CROSS JOIN pod_lock
    WHERE existing.pod_id = sqlc.arg(pod_id)
      AND (
          existing.user_principal_id IN (
              SELECT ep.principal_id::UUID
              FROM get_user_effective_principals(sqlc.arg(user_principal_id)) AS ep(principal_id)
          )
          OR sqlc.arg(user_principal_id) IN (
              SELECT ep.principal_id::UUID
              FROM get_user_effective_principals(existing.user_principal_id) AS ep(principal_id)
          )
      )
)
INSERT INTO pod_clone_claims (pod_id, user_principal_id, action, actor_principal_id)
SELECT sqlc.arg(pod_id), sqlc.arg(user_principal_id), sqlc.arg(action), sqlc.arg(actor_principal_id)
FROM pod_lock
WHERE NOT EXISTS (SELECT 1 FROM conflicting_claim)
RETURNING pod_id, user_principal_id, action, actor_principal_id, claimed_at;

-- name: GetConflictingClonedPodForPrincipalByPodID :one
SELECT
    cp.id,
    cp.pod_id,
    cp.user_principal_id,
    cp.folder_id,
    cp.network_number,
    cp.created_at,
    cp.updated_at
FROM cloned_pods cp
WHERE cp.pod_id = sqlc.arg(pod_id)
  AND (
      cp.user_principal_id IN (
          SELECT ep.principal_id::UUID
          FROM get_user_effective_principals(sqlc.arg(user_principal_id)) AS ep(principal_id)
      )
      OR sqlc.arg(user_principal_id) IN (
          SELECT ep.principal_id::UUID
          FROM get_user_effective_principals(cp.user_principal_id) AS ep(principal_id)
      )
  )
ORDER BY
    CASE WHEN cp.user_principal_id = sqlc.arg(user_principal_id) THEN 0 ELSE 1 END,
    cp.created_at DESC
LIMIT 1;

-- name: ReleasePodClone :exec
DELETE FROM pod_clone_claims
WHERE pod_id = $1
  AND user_principal_id = $2;

-- name: DeleteAllPodCloneClaims :execrows
DELETE FROM pod_clone_claims;
