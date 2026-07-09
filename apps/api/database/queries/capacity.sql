-- name: CreateFolderVMCapacityReservation :one
INSERT INTO folder_vm_capacity_reservations (folder_id, vm_count, operation)
VALUES ($1, $2, $3)
RETURNING id, folder_id, vm_count, operation, created_at;

-- name: ReleaseFolderVMCapacityReservation :exec
DELETE FROM folder_vm_capacity_reservations
WHERE id = $1;

-- name: SumActiveFolderVMCapacityReservations :one
-- Reservations older than 1 hour are treated as leaked (crashed or
-- disconnected operation) and no longer count against folder capacity.
SELECT COALESCE(SUM(vm_count), 0)::INTEGER AS total
FROM folder_vm_capacity_reservations
WHERE folder_id = $1
  AND created_at > now() - INTERVAL '1 hour';

-- name: DeleteExpiredFolderVMCapacityReservations :execrows
DELETE FROM folder_vm_capacity_reservations
WHERE created_at < now() - INTERVAL '1 hour';
