-- name: AcquirePodNetworkAllocationLock :exec
SELECT pg_advisory_xact_lock(740020001);
