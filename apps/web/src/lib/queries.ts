export async function fetchVmStatuses(): Promise<Record<number, string>> {
  const res = await fetch("/api/v1/vms/status")
  if (!res.ok) throw new Error(`Failed to fetch VM statuses: ${res.status}`)
  return res.json()
}

export const vmStatusQueryOptions = {
  queryKey: ["vms", "status"] as const,
  queryFn: fetchVmStatuses,
  refetchInterval: 30_000,
}
