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

export async function vmPowerAction(params: {
  node: string
  vmid: number
  action: "start" | "shutdown" | "reboot" | "stop"
}): Promise<void> {
  const res = await fetch("/api/v1/vms/power", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to ${params.action} VM: ${res.status}`
    )
  }
}

export async function deleteVM(params: {
  node: string
  vmid: number
}): Promise<void> {
  const res = await fetch(`/api/v1/vms/${params.node}/${params.vmid}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete VM: ${res.status}`)
  }
}

export async function renameVM(params: {
  node: string
  vmid: number
  name: string
}): Promise<void> {
  const res = await fetch("/api/v1/vms/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to rename VM: ${res.status}`)
  }
}

export async function cloneVM(params: {
  node: string
  vmid: number
  newid: number
  name: string
  full: boolean
}): Promise<void> {
  const res = await fetch("/api/v1/vms/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to clone VM: ${res.status}`)
  }
}

export async function convertToTemplate(params: {
  node: string
  vmid: number
}): Promise<void> {
  const res = await fetch("/api/v1/vms/template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to convert to template: ${res.status}`
    )
  }
}

export type ApiSnapshot = {
  name: string
  description: string
  snaptime?: number
  parent?: string
  vmstate?: boolean
}

export function snapshotsQueryOptions(node: string, vmid: number) {
  return {
    queryKey: ["vms", node, vmid, "snapshots"] as const,
    queryFn: async (): Promise<Array<ApiSnapshot>> => {
      const res = await fetch(`/api/v1/vms/${node}/${vmid}/snapshots`)
      if (!res.ok) throw new Error(`Failed to fetch snapshots: ${res.status}`)
      return res.json()
    },
  }
}

export async function rollbackSnapshot(params: {
  node: string
  vmid: number
  snapname: string
}): Promise<void> {
  const res = await fetch("/api/v1/vms/snapshot/rollback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to rollback snapshot: ${res.status}`)
  }
}

export async function deleteSnapshot(params: {
  node: string
  vmid: number
  snapname: string
}): Promise<void> {
  const res = await fetch(
    `/api/v1/vms/${params.node}/${params.vmid}/snapshots/${params.snapname}`,
    { method: "DELETE" }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete snapshot: ${res.status}`)
  }
}

export async function createSnapshot(params: {
  node: string
  vmid: number
  snapname: string
  description?: string
  vmstate?: boolean
}): Promise<void> {
  const res = await fetch("/api/v1/vms/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create snapshot: ${res.status}`)
  }
}

// --- VM Creation metadata ---

export type ApiNode = {
  node: string
  status: string
  cpu: number
  maxcpu: number
  mem: number
  maxmem: number
}

export type ApiNetworkBridge = {
  iface: string
  type: string
  active?: number
  comments?: string
}

export function bridgesQueryOptions(node: string) {
  return {
    queryKey: ["proxmox", "bridges", node] as const,
    queryFn: async (): Promise<{
      bridges: Array<ApiNetworkBridge>
      vnets: Array<ApiVNet>
    }> => {
      const res = await fetch(`/api/v1/proxmox/nodes/${node}/bridges`)
      if (!res.ok) throw new Error(`Failed to fetch bridges: ${res.status}`)
      return res.json()
    },
    enabled: !!node,
  }
}

export type ApiStorage = {
  storage: string
  type: string
  content: string
  avail: number
  total: number
  used: number
}

export type ApiISO = {
  volid: string
  format: string
  size: number
}

export const nodesQueryOptions = {
  queryKey: ["proxmox", "nodes"] as const,
  queryFn: async (): Promise<Array<ApiNode>> => {
    const res = await fetch("/api/v1/proxmox/nodes")
    if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status}`)
    return res.json()
  },
}

export function storagesQueryOptions(node: string) {
  return {
    queryKey: ["proxmox", "storages", node] as const,
    queryFn: async (): Promise<Array<ApiStorage>> => {
      const res = await fetch(`/api/v1/proxmox/nodes/${node}/storages`)
      if (!res.ok) throw new Error(`Failed to fetch storages: ${res.status}`)
      return res.json()
    },
    enabled: !!node,
  }
}

export function isosQueryOptions(node: string, storage: string) {
  return {
    queryKey: ["proxmox", "isos", node, storage] as const,
    queryFn: async (): Promise<Array<ApiISO>> => {
      const res = await fetch(
        `/api/v1/proxmox/nodes/${node}/storages/${storage}/isos`
      )
      if (!res.ok) throw new Error(`Failed to fetch ISOs: ${res.status}`)
      return res.json()
    },
    enabled: !!node && !!storage,
  }
}

export async function getNextVMID(): Promise<number> {
  const res = await fetch("/api/v1/proxmox/nextid")
  if (!res.ok) throw new Error(`Failed to fetch next VMID: ${res.status}`)
  const data = await res.json()
  return data.vmid
}

export type NetworkInterface = {
  bridge: string
  model: string
  vlan_tag?: number
  firewall: boolean
}

export type CreateVMParams = {
  node: string
  vmid: number
  name: string
  pool?: string
  ostype?: string
  iso?: string
  bios?: string
  machine?: string
  sockets?: number
  cores?: number
  cpu_type?: string
  numa?: boolean
  memory?: number
  balloon?: number
  storage?: string
  disk_size?: number
  networks: Array<NetworkInterface>
}

export async function createVM(params: CreateVMParams): Promise<void> {
  const res = await fetch("/api/v1/vms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create VM: ${res.status}`)
  }
}

// --- SDN ---

export type ApiVNet = {
  vnet: string
  zone: string
  tag?: number
  alias?: string
}

export const vnetsQueryOptions = {
  queryKey: ["sdn", "vnets"] as const,
  queryFn: async (): Promise<Array<ApiVNet>> => {
    const res = await fetch("/api/v1/sdn/vnets")
    if (!res.ok) throw new Error(`Failed to fetch VNets: ${res.status}`)
    return res.json()
  },
}

export async function createVNet(params: {
  vnet: string
  zone: string
  tag?: number
  alias?: string
}): Promise<void> {
  const res = await fetch("/api/v1/sdn/vnets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create VNet: ${res.status}`)
  }
}

export async function updateVNet(
  vnet: string,
  params: { zone?: string; tag?: number; alias?: string }
): Promise<void> {
  const res = await fetch(`/api/v1/sdn/vnets/${vnet}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update VNet: ${res.status}`)
  }
}

export async function deleteVNet(vnet: string): Promise<void> {
  const res = await fetch(`/api/v1/sdn/vnets/${vnet}`, { method: "DELETE" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete VNet: ${res.status}`)
  }
}

// --- Principals (Users & Groups) ---

export type ApiPrincipal = {
  id: string
  external_id: string
  name: string | null
}

export type ApiGroupMember = {
  id: string
  principal_type: "user" | "group"
  external_id: string
  name: string | null
}

export const usersQueryOptions = {
  queryKey: ["principals", "users"] as const,
  queryFn: async (): Promise<Array<ApiPrincipal>> => {
    const res = await fetch("/api/v1/principals/users")
    if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
    return res.json()
  },
}

export const groupsQueryOptions = {
  queryKey: ["principals", "groups"] as const,
  queryFn: async (): Promise<Array<ApiPrincipal>> => {
    const res = await fetch("/api/v1/principals/groups")
    if (!res.ok) throw new Error(`Failed to fetch groups: ${res.status}`)
    return res.json()
  },
}

export function groupMembersQueryOptions(groupId: string) {
  return {
    queryKey: ["principals", "groups", groupId, "members"] as const,
    queryFn: async (): Promise<Array<ApiGroupMember>> => {
      const res = await fetch(`/api/v1/principals/groups/${groupId}/members`)
      if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`)
      return res.json()
    },
    enabled: !!groupId,
  }
}

export async function createUser(params: {
  username: string
  password: string
}): Promise<void> {
  const res = await fetch("/api/v1/principals/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create user: ${res.status}`)
  }
}

export async function updateUser(
  id: string,
  params: { username: string }
): Promise<void> {
  const res = await fetch(`/api/v1/principals/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update user: ${res.status}`)
  }
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`/api/v1/principals/users/${id}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete user: ${res.status}`)
  }
}

export async function setUserPassword(
  id: string,
  password: string
): Promise<void> {
  const res = await fetch(`/api/v1/principals/users/${id}/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to set password: ${res.status}`)
  }
}

export async function enableUser(id: string): Promise<void> {
  const res = await fetch(`/api/v1/principals/users/${id}/enable`, {
    method: "POST",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to enable user: ${res.status}`)
  }
}

export async function disableUser(id: string): Promise<void> {
  const res = await fetch(`/api/v1/principals/users/${id}/disable`, {
    method: "POST",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to disable user: ${res.status}`)
  }
}

export async function createGroup(params: { name: string }): Promise<void> {
  const res = await fetch("/api/v1/principals/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create group: ${res.status}`)
  }
}

export async function updateGroup(
  id: string,
  params: { name: string }
): Promise<void> {
  const res = await fetch(`/api/v1/principals/groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update group: ${res.status}`)
  }
}

export async function deleteGroup(id: string): Promise<void> {
  const res = await fetch(`/api/v1/principals/groups/${id}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete group: ${res.status}`)
  }
}

export async function addGroupMember(
  groupId: string,
  memberId: string
): Promise<void> {
  const res = await fetch(`/api/v1/principals/groups/${groupId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ member_id: memberId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to add member: ${res.status}`)
  }
}

export async function removeGroupMember(
  groupId: string,
  memberId: string
): Promise<void> {
  const res = await fetch(
    `/api/v1/principals/groups/${groupId}/members/${memberId}`,
    { method: "DELETE" }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to remove member: ${res.status}`)
  }
}

export function userGroupsQueryOptions(userId: string) {
  return {
    queryKey: ["principals", "users", userId, "groups"] as const,
    queryFn: async (): Promise<Array<ApiGroupMember>> => {
      const res = await fetch(`/api/v1/principals/users/${userId}/groups`)
      if (!res.ok) throw new Error(`Failed to fetch user groups: ${res.status}`)
      return res.json()
    },
    enabled: !!userId,
  }
}

export async function triggerADSync(): Promise<void> {
  const res = await fetch("/api/v1/principals/sync", { method: "POST" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `AD sync failed: ${res.status}`)
  }
}
