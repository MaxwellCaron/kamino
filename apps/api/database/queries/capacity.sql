-- name: CreateFolderVMCapacityReservation :one
INSERT INTO folder_vm_capacity_reservations (folder_id, vm_count, operation)
VALUES ($1, $2, $3)
RETURNING id, folder_id, vm_count, operation, created_at;

-- name: ReleaseFolderVMCapacityReservation :exec
DELETE FROM folder_vm_capacity_reservations
WHERE id = $1;

-- name: SumActiveFolderVMCapacityReservations :one
SELECT COALESCE(SUM(vm_count), 0)::INTEGER AS total
FROM folder_vm_capacity_reservations
WHERE folder_id = $1;
