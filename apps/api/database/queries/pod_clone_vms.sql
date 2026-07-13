-- name: InsertClonedPodVM :exec
INSERT INTO cloned_pod_vms (
    cloned_pod_id,
    published_pod_vm_id,
    inventory_item_id,
    sort_order
) VALUES ($1, $2, $3, $4);

-- name: DeleteClonedPodVMs :exec
DELETE FROM cloned_pod_vms
WHERE cloned_pod_id = $1;

-- name: ListClonedPodVMs :many
SELECT
    cpv.cloned_pod_id,
    cpv.inventory_item_id,
    ii.name,
    pv.node,
    pv.vmid,
    cpv.sort_order
FROM cloned_pod_vms cpv
JOIN inventory_items ii
  ON ii.id = cpv.inventory_item_id
LEFT JOIN proxmox_vms pv
  ON pv.inventory_item_id = cpv.inventory_item_id
WHERE cpv.cloned_pod_id = $1
ORDER BY cpv.sort_order ASC;

