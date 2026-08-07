-- name: ListPodCloneTargets :many
SELECT
    key,
    label,
    network_profile_key,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    network_min,
    network_max,
    cloud_init_storage,
    is_default,
    is_personal,
    created_at,
    updated_at
FROM pod_clone_targets
ORDER BY is_default DESC, lower(label) ASC, key ASC;

-- name: GetPodCloneTarget :one
SELECT
    key,
    label,
    network_profile_key,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    network_min,
    network_max,
    cloud_init_storage,
    is_default,
    is_personal,
    created_at,
    updated_at
FROM pod_clone_targets
WHERE key = $1;

-- name: GetDefaultPodCloneTarget :one
SELECT
    key,
    label,
    network_profile_key,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    network_min,
    network_max,
    cloud_init_storage,
    is_default,
    is_personal,
    created_at,
    updated_at
FROM pod_clone_targets
WHERE is_default;

-- name: GetPersonalPodCloneTarget :one
SELECT
    key,
    label,
    network_profile_key,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    network_min,
    network_max,
    cloud_init_storage,
    is_default,
    is_personal,
    created_at,
    updated_at
FROM pod_clone_targets
WHERE is_personal;

-- name: InsertPersonalPodCloneTarget :exec
INSERT INTO pod_clone_targets (
    key,
    label,
    network_profile_key,
    lan_vnet,
    wan_bridge,
    wan_subnet,
    network_min,
    network_max,
    cloud_init_storage,
    is_personal
)
SELECT
    sqlc.arg(key),
    sqlc.arg(label),
    'lan-router-v1',
    sqlc.arg(lan_vnet),
    sqlc.arg(wan_bridge),
    sqlc.arg(wan_subnet),
    sqlc.arg(network_min),
    sqlc.arg(network_max),
    sqlc.arg(cloud_init_storage),
    true
WHERE NOT EXISTS (SELECT 1 FROM pod_clone_targets WHERE is_personal);

-- name: CountPodCloneTargets :one
SELECT count(*) FROM pod_clone_targets;

-- name: InsertDefaultPodCloneTarget :exec
INSERT INTO pod_clone_targets (
    key,
    label,
    network_profile_key,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    network_min,
    network_max,
    cloud_init_storage,
    is_default
)
SELECT
    sqlc.arg(key),
    sqlc.arg(label),
    sqlc.arg(network_profile_key),
    sqlc.arg(lan_vnet),
    sqlc.arg(dmz_vnet),
    sqlc.arg(wan_bridge),
    sqlc.arg(wan_subnet),
    sqlc.arg(network_min),
    sqlc.arg(network_max),
    sqlc.arg(cloud_init_storage),
    true
WHERE NOT EXISTS (SELECT 1 FROM pod_clone_targets);

-- name: CreatePodCloneTarget :one
INSERT INTO pod_clone_targets (
    key,
    label,
    network_profile_key,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    network_min,
    network_max,
    cloud_init_storage
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
RETURNING
    key,
    label,
    network_profile_key,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    network_min,
    network_max,
    cloud_init_storage,
    is_default,
    is_personal,
    created_at,
    updated_at;

-- name: UpdatePodCloneTarget :one
UPDATE pod_clone_targets
   SET label                        = sqlc.arg(label),
       network_profile_key          = sqlc.arg(network_profile_key),
       lan_vnet                     = sqlc.arg(lan_vnet),
       dmz_vnet                     = sqlc.arg(dmz_vnet),
       wan_bridge                   = sqlc.arg(wan_bridge),
       wan_subnet                   = sqlc.arg(wan_subnet),
       network_min                  = sqlc.arg(network_min),
       network_max                  = sqlc.arg(network_max),
       cloud_init_storage           = sqlc.arg(cloud_init_storage)
 WHERE key = sqlc.arg(key)
RETURNING
    key,
    label,
    network_profile_key,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    network_min,
    network_max,
    cloud_init_storage,
    is_default,
    is_personal,
    created_at,
    updated_at;

-- name: DeletePodCloneTarget :execrows
DELETE FROM pod_clone_targets
WHERE key = $1
  AND NOT is_default;

-- name: CountPodCloneTargetReferences :one
SELECT
    (SELECT count(*) FROM published_pods pp WHERE pp.clone_target_key = sqlc.arg(target_key)) AS published_pod_count,
    (SELECT count(*) FROM cloned_pods cp WHERE cp.clone_target_key = sqlc.arg(target_key)) AS cloned_pod_count,
    (SELECT count(*) FROM pod_network_allocations pna WHERE pna.clone_target_key = sqlc.arg(target_key)) AS allocation_count,
    (SELECT count(*) FROM personal_pods pp2 WHERE pp2.clone_target_key = sqlc.arg(target_key)) AS personal_pod_count;
