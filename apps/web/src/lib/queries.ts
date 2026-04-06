export type ApiTreeNode = {
  id: string
  name: string
  kind: "folder" | "vm"
  children?: Array<ApiTreeNode>
  vm?: {
    node: string
    vmid: number
    is_template: boolean
    cpu_count?: number
    memory_mb?: number
    disk_gb?: number
  }
}

export function findTreeNode(
  nodes: Array<ApiTreeNode>,
  id: string
): ApiTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findTreeNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

async function fetchInventoryTree(): Promise<Array<ApiTreeNode>> {
  const res = await fetch("/api/v1/inventory/tree")
  if (!res.ok) throw new Error(`Failed to fetch inventory: ${res.status}`)
  return res.json()
}

export const inventoryTreeQueryOptions = {
  queryKey: ["inventory", "tree"] as const,
  queryFn: fetchInventoryTree,
}

async function fetchVmStatuses(): Promise<Record<number, string>> {
  const res = await fetch("/api/v1/vms/status")
  if (!res.ok) throw new Error(`Failed to fetch VM statuses: ${res.status}`)
  return res.json()
}

export const vmStatusQueryOptions = {
  queryKey: ["vms", "status"] as const,
  queryFn: fetchVmStatuses,
  refetchInterval: 30_000,
}

export async function createSnapshot(params: {
  node: string
  vmid: number
  snapname: string
  description?: string
  vmstate?: boolean
}): Promise<{ task_id: string }> {
  const res = await fetch("/api/v1/vms/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create snapshot: ${res.status}`)
  }
  return res.json()
}
