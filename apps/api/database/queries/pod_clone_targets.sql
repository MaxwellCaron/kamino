-- name: ListPodCloneTargets :many
SELECT
    key,
    label,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    cloud_init_storage,
    cloud_init_user_file_pattern,
    cloud_init_network_file,
    lan_dmz_user_file_pattern,
    lan_dmz_network_file,
    is_default,
    created_at,
    updated_at
FROM pod_clone_targets
ORDER BY is_default DESC, lower(label) ASC, key ASC;

-- name: GetPodCloneTarget :one
SELECT
    key,
    label,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    cloud_init_storage,
    cloud_init_user_file_pattern,
    cloud_init_network_file,
    lan_dmz_user_file_pattern,
    lan_dmz_network_file,
    is_default,
    created_at,
    updated_at
FROM pod_clone_targets
WHERE key = $1;

-- name: GetDefaultPodCloneTarget :one
SELECT
    key,
    label,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    cloud_init_storage,
    cloud_init_user_file_pattern,
    cloud_init_network_file,
    lan_dmz_user_file_pattern,
    lan_dmz_network_file,
    is_default,
    created_at,
    updated_at
FROM pod_clone_targets
WHERE is_default;

-- name: CountPodCloneTargets :one
SELECT count(*) FROM pod_clone_targets;

-- name: InsertDefaultPodCloneTarget :exec
INSERT INTO pod_clone_targets (
    key,
    label,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    cloud_init_storage,
    cloud_init_user_file_pattern,
    cloud_init_network_file,
    lan_dmz_user_file_pattern,
    lan_dmz_network_file,
    is_default
)
SELECT
    sqlc.arg(key),
    sqlc.arg(label),
    sqlc.arg(lan_vnet),
    sqlc.arg(dmz_vnet),
    sqlc.arg(wan_bridge),
    sqlc.arg(wan_subnet),
    sqlc.arg(cloud_init_storage),
    sqlc.arg(cloud_init_user_file_pattern),
    sqlc.arg(cloud_init_network_file),
    sqlc.arg(lan_dmz_user_file_pattern),
    sqlc.arg(lan_dmz_network_file),
    true
WHERE NOT EXISTS (SELECT 1 FROM pod_clone_targets);

-- name: CreatePodCloneTarget :one
INSERT INTO pod_clone_targets (
    key,
    label,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    cloud_init_storage,
    cloud_init_user_file_pattern,
    cloud_init_network_file,
    lan_dmz_user_file_pattern,
    lan_dmz_network_file
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
)
RETURNING
    key,
    label,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    cloud_init_storage,
    cloud_init_user_file_pattern,
    cloud_init_network_file,
    lan_dmz_user_file_pattern,
    lan_dmz_network_file,
    is_default,
    created_at,
    updated_at;

-- name: UpdatePodCloneTarget :one
UPDATE pod_clone_targets
   SET label                        = sqlc.arg(label),
       lan_vnet                     = sqlc.arg(lan_vnet),
       dmz_vnet                     = sqlc.arg(dmz_vnet),
       wan_bridge                   = sqlc.arg(wan_bridge),
       wan_subnet                   = sqlc.arg(wan_subnet),
       cloud_init_storage           = sqlc.arg(cloud_init_storage),
       cloud_init_user_file_pattern = sqlc.arg(cloud_init_user_file_pattern),
       cloud_init_network_file      = sqlc.arg(cloud_init_network_file),
       lan_dmz_user_file_pattern    = sqlc.arg(lan_dmz_user_file_pattern),
       lan_dmz_network_file         = sqlc.arg(lan_dmz_network_file)
 WHERE key = sqlc.arg(key)
RETURNING
    key,
    label,
    lan_vnet,
    dmz_vnet,
    wan_bridge,
    wan_subnet,
    cloud_init_storage,
    cloud_init_user_file_pattern,
    cloud_init_network_file,
    lan_dmz_user_file_pattern,
    lan_dmz_network_file,
    is_default,
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
    (SELECT count(*) FROM pod_network_allocations pna WHERE pna.clone_target_key = sqlc.arg(target_key)) AS allocation_count;
