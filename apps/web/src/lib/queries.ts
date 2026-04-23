import type {
  ApiManagementPermissionSection,
  ManagementPermissionKey,
} from "@/lib/management-permissions"
import {
  ManagementPermissionKeys,
  canAccessAdmin,
  canAccessRequestQueue,
  expandManagementPermissionGrants,
  hasManagementPermission,
  normalizeManagementPermissionGrants,
} from "@/lib/management-permissions"
import {
  InventoryPermissionBits,
  hasInventoryPermission,
} from "@/lib/inventory-permissions"

export {
  canAccessAdmin,
  canAccessRequestQueue,
  InventoryPermissionBits,
  ManagementPermissionKeys,
  expandManagementPermissionGrants,
  hasInventoryPermission,
  hasManagementPermission,
  normalizeManagementPermissionGrants,
}

// --- Auth & fetch wrapper ---

const AUTH_REFRESH_BUFFER_MS = 60_000
const AUTH_BOOTSTRAP_RETRY_BUFFER_MS = 5_000
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") ??
  (import.meta.env.DEV ? "http://localhost:8080" : "")

let currentSession: AuthSession | null = null
let refreshPromise: Promise<AuthSession> | null = null
let bootstrapPromise: Promise<AuthSession> | null = null
let refreshTimer: number | null = null
let authFailure: AuthenticationError | null = null

class AuthenticationError extends Error {}

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

export type AuthUser = {
  id: string
  username: string
  management_permissions: ApiManagementPermissions
}

export type AuthSession = {
  user: AuthUser
  access_token_expires_at: string
}

export type ApiRequestScope = "pending" | "completed"

export type ApiRequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "executed"
  | "execution_failed"

export type ApiRequestInventoryPayload = {
  item_id?: string | null
  item_name?: string | null
  item_kind?: "folder" | "vm" | null
  item_parent_id?: string | null
  vm_node?: string | null
  vmid?: number | null
  is_template?: boolean | null
  power_action?: string | null
  snapshot_name?: string | null
}

export type ApiRequestSummary = {
  id: string
  family: string
  kind: string
  status: ApiRequestStatus
  requester_principal_id: string
  requester_username: string
  reviewer_principal_id?: string | null
  reviewer_username?: string | null
  reviewed_at?: string | null
  executed_at?: string | null
  execution_error?: string | null
  created_at?: string | null
  updated_at?: string | null
  inventory?: ApiRequestInventoryPayload | null
}

export type ApiRequestEvent = {
  id: number
  event_kind: string
  actor_principal_id?: string | null
  actor_username?: string | null
  from_status?: string | null
  to_status: string
  error_message?: string | null
  created_at?: string | null
}

export type ApiRequestDetail = ApiRequestSummary & {
  events: Array<ApiRequestEvent>
}

function clearRefreshTimer() {
  if (refreshTimer) {
    window.clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

function scheduleRefresh(expiresAt: string) {
  clearRefreshTimer()

  if (typeof window === "undefined") return

  const refreshAt = new Date(expiresAt).getTime() - AUTH_REFRESH_BUFFER_MS
  const delay = Math.max(refreshAt - Date.now(), 0)

  refreshTimer = window.setTimeout(() => {
    void refreshAuth().catch(() => {
      // Keep the current UI alive on transient failures.
    })
  }, delay)
}

function applyAuthSession(session: AuthSession): AuthSession {
  currentSession = session
  authFailure = null
  scheduleRefresh(session.access_token_expires_at)
  return session
}

function resetAuthState() {
  currentSession = null
  bootstrapPromise = null
  clearRefreshTimer()
  refreshPromise = null
}

function clearAuthState() {
  resetAuthState()
  authFailure = null
}

function invalidateAuthState(message = "authentication failed") {
  resetAuthState()
  authFailure = new AuthenticationError(message)
}

function redirectToLogin() {
  if (typeof window === "undefined") return
  if (window.location.pathname === "/login") return

  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`)
}

function isAuthEndpoint(input: string) {
  return input.startsWith("/api/v1/auth/")
}

export async function apiFetch(
  input: string,
  init?: RequestInit,
  options?: { retryOn401?: boolean }
): Promise<Response> {
  const retryOn401 = options?.retryOn401 ?? true
  const requestInit = { credentials: "include" as const, ...init }
  const isProtectedRequest = retryOn401 && !isAuthEndpoint(input)

  if (isProtectedRequest) {
    if (authFailure) {
      redirectToLogin()
      return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    try {
      if (refreshPromise) {
        await refreshPromise
      } else if (currentSession !== null && isSessionExpired(currentSession)) {
        await refreshAuth()
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        redirectToLogin()
      }

      return new Response(null, { status: 401, statusText: "Unauthorized" })
    }
  }

  const response = await fetch(apiUrl(input), requestInit)
  if (response.status !== 401 || !retryOn401 || isAuthEndpoint(input)) {
    return response
  }

  try {
    await refreshAuth()
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirectToLogin()
    }
    return response
  }

  const retried = await fetch(apiUrl(input), requestInit)
  if (retried.status === 401) {
    invalidateAuthState("request retry failed")
    redirectToLogin()
  }

  return retried
}

async function fetchAuthSession(): Promise<AuthSession> {
  const res = await apiFetch("/api/v1/auth/me")
  if (!res.ok) throw new Error("not authenticated")
  return applyAuthSession(await res.json())
}

export async function ensureAuth(): Promise<AuthSession> {
  if (authFailure) {
    redirectToLogin()
    throw authFailure
  }

  if (isSessionUsable(currentSession)) {
    return currentSession
  }

  if (bootstrapPromise) {
    return bootstrapPromise
  }

  bootstrapPromise = (async () => {
    if (isSessionExpired(currentSession)) {
      return refreshAuth()
    }

    try {
      return await fetchAuthSession()
    } catch {
      return await refreshAuth()
    }
  })()

  try {
    return await bootstrapPromise
  } finally {
    bootstrapPromise = null
  }
}

export const authMeQueryOptions = {
  queryKey: ["auth", "me"] as const,
  queryFn: fetchAuthSession,
  retry: false,
  staleTime: Infinity,
}

export async function login(params: {
  username: string
  password: string
}): Promise<AuthSession> {
  const res = await fetch(apiUrl("/api/v1/auth/login"), {
    ...{ method: "POST", credentials: "include" as const },
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "Login failed")
  }

  return applyAuthSession(await res.json())
}

export async function logout(): Promise<void> {
  await fetch(apiUrl("/api/v1/auth/logout"), {
    ...{ method: "POST", credentials: "include" as const },
  })
  clearAuthState()
}

export async function refreshAuth(): Promise<AuthSession> {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    const res = await fetch(apiUrl("/api/v1/auth/refresh"), {
      method: "POST",
      credentials: "include",
    })
    if (!res.ok) {
      if (res.status === 401) {
        try {
          return await fetchAuthSession()
        } catch {
          invalidateAuthState("refresh failed")
          throw authFailure ?? new AuthenticationError("refresh failed")
        }
      }
      throw new Error("refresh failed")
    }

    return applyAuthSession(await res.json())
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

function getSessionExpiryMs(session: AuthSession | null) {
  if (!session) return 0
  return new Date(session.access_token_expires_at).getTime()
}

function isSessionExpired(session: AuthSession | null) {
  return Date.now() >= getSessionExpiryMs(session)
}

function isSessionUsable(session: AuthSession | null): session is AuthSession {
  return (
    !!session &&
    Date.now() < getSessionExpiryMs(session) - AUTH_BOOTSTRAP_RETRY_BUFFER_MS
  )
}

// --- Inventory ---

export type ApiTreeNodeVM = {
  node: string
  vmid: number
  is_template: boolean
  notes?: string | null
  cpu_count?: number
  memory_mb?: number
  disk_gb?: number
}

export type ApiManagementPermissions = {
  grants: Array<ManagementPermissionKey>
}

export type ApiGroupManagementAcl = {
  can_edit_bootstrap_only: boolean
  effective_grants: Array<ManagementPermissionKey>
  grants: Array<ManagementPermissionKey>
  group_id: string
  immutable: boolean
  sections: Array<ApiManagementPermissionSection>
}

export type ApiTreeNodePermissions = {
  allowed_mask: number
  denied_mask: number
  request_mask: number
}

export type ApiTreeNode = {
  id: string
  name: string
  kind: "folder" | "vm"
  permissions: ApiTreeNodePermissions
  children?: Array<ApiTreeNode>
  vm?: ApiTreeNodeVM
}

export type ApiInventoryItem = {
  id: string
  parent_id: string | null
  kind: "folder" | "vm"
  name: string
  inherit_permissions: boolean
  permissions: ApiTreeNodePermissions
  vm?: ApiTreeNodeVM
}

export type ApiVmMutationResult = {
  vmid: number
  item_id: string
  item: ApiInventoryItem
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

export function findTreePath(
  nodes: Array<ApiTreeNode>,
  id: string,
  parents: Array<ApiTreeNode> = []
): Array<ApiTreeNode> | null {
  for (const node of nodes) {
    const path = [...parents, node]

    if (node.id === id) {
      return path
    }

    if (node.children) {
      const found = findTreePath(node.children, id, path)
      if (found) {
        return found
      }
    }
  }

  return null
}

export type ApiInventoryAclEntry = {
  id: string
  principal_id: string
  principal_type: "user" | "group"
  principal_external_id: string
  principal_name: string | null
  effect: "allow" | "deny"
  permissions: number
  immutable: boolean
}

export type ApiInheritedInventoryAclEntry = {
  id: string
  source_item_id: string
  source_item_name: string
  principal_id: string
  principal_type: "user" | "group"
  principal_external_id: string
  principal_name: string | null
  effect: "allow" | "deny"
  permissions: number
  immutable: boolean
}

export type ApiInventoryAcl = {
  entries: Array<ApiInventoryAclEntry>
  inherited_entries: Array<ApiInheritedInventoryAclEntry>
}

async function fetchInventoryTree(): Promise<Array<ApiTreeNode>> {
  const res = await apiFetch("/api/v1/inventory/tree")
  if (!res.ok) throw new Error(`Failed to fetch inventory: ${res.status}`)
  return res.json()
}

export const inventoryTreeQueryOptions = {
  queryKey: ["inventory", "tree"] as const,
  queryFn: fetchInventoryTree,
}

export function inventoryItemQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId] as const,
    queryFn: async (): Promise<ApiInventoryItem> => {
      const res = await apiFetch(`/api/v1/inventory/items/${itemId}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch inventory item: ${res.status}`)
      }
      return res.json()
    },
    enabled: !!itemId,
  }
}

// Preload the item query used by /vm/$itemId so create/clone navigation
// can render immediately without an extra inventory item request.
export function seedInventoryItemCache(
  queryClient: {
    setQueryData: <T>(queryKey: ReadonlyArray<unknown>, updater: T) => void
  },
  itemId: string,
  item: ApiInventoryItem
) {
  queryClient.setQueryData(inventoryItemQueryOptions(itemId).queryKey, item)
}

export function inventoryAclQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", itemId, "acl"] as const,
    queryFn: async (): Promise<ApiInventoryAcl> => {
      const res = await apiFetch(`/api/v1/inventory/items/${itemId}/acl`)
      if (!res.ok) {
        throw new Error(`Failed to fetch inventory ACL: ${res.status}`)
      }
      return res.json()
    },
    enabled: !!itemId,
  }
}

export async function updateInventoryAcl(params: {
  itemId: string
  entries: Array<{
    principal_id: string
    effect: "allow" | "deny"
    permissions: number
  }>
}): Promise<void> {
  const res = await apiFetch(`/api/v1/inventory/items/${params.itemId}/acl`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entries: params.entries,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to update inventory ACL: ${res.status}`
    )
  }
}

export async function moveInventoryItem(params: {
  itemId: string
  parentId: string
}): Promise<void> {
  const res = await apiFetch("/api/v1/inventory/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_id: params.itemId,
      parent_id: params.parentId,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to move inventory item: ${res.status}`
    )
  }
}

export async function createFolder(params: {
  parentId: string
  name: string
}): Promise<void> {
  const res = await apiFetch("/api/v1/inventory/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parent_id: params.parentId,
      name: params.name,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create folder: ${res.status}`)
  }
}

export async function renameFolder(params: {
  id: string
  name: string
}): Promise<void> {
  const res = await apiFetch(`/api/v1/inventory/folders/${params.id}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: params.name }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to rename folder: ${res.status}`)
  }
}

export async function deleteFolder(params: { id: string }): Promise<void> {
  const res = await apiFetch(`/api/v1/inventory/folders/${params.id}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete folder: ${res.status}`)
  }
}

async function fetchVmStatuses(): Promise<Record<number, string>> {
  const res = await apiFetch("/api/v1/vms/status")
  if (!res.ok) throw new Error(`Failed to fetch VM statuses: ${res.status}`)
  return res.json()
}

export const vmStatusQueryOptions = {
  queryKey: ["vms", "status"] as const,
  queryFn: fetchVmStatuses,
}

export type VmResources = {
  cpu: number
  maxcpu: number
  mem: number
  maxmem: number
  disk: number
  maxdisk: number
  netin: number
  netout: number
  diskread: number
  diskwrite: number
  uptime: number
}

async function fetchVmResources(itemId: string): Promise<VmResources> {
  const res = await apiFetch(`/api/v1/inventory/items/${itemId}/vm/resources`)
  if (!res.ok) throw new Error(`Failed to fetch VM resources: ${res.status}`)
  return res.json()
}

export function vmResourcesQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId, "vm", "resources"] as const,
    queryFn: () => fetchVmResources(itemId),
    refetchInterval: 10_000,
    enabled: !!itemId,
  }
}

export type ApiBulkVmMutationFailure = {
  id: string
  error: string
}

export type ApiBulkVmMutationResponse = {
  succeeded: Array<string>
  failed: Array<ApiBulkVmMutationFailure>
}

export async function vmPowerAction(params: {
  itemIds: Array<string>
  action: "start" | "shutdown" | "reboot" | "stop"
}): Promise<ApiBulkVmMutationResponse> {
  if (params.itemIds.length === 0) {
    throw new Error("At least one VM is required")
  }

  const res = await apiFetch(`/api/v1/inventory/vms/power`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: params.action,
      item_ids: params.itemIds,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to ${params.action} selected VMs: ${res.status}`
    )
  }

  return res.json()
}

export async function submitInventoryPowerRequest(params: {
  itemId: string
  action: "start" | "shutdown" | "reboot" | "stop"
}): Promise<ApiRequestDetail> {
  const res = await apiFetch(
    `/api/v1/requests/inventory/items/${params.itemId}/vm/power`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: params.action }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to submit power request: ${res.status}`
    )
  }

  return res.json()
}

export async function deleteVM(params: {
  itemIds: Array<string>
}): Promise<ApiBulkVmMutationResponse> {
  if (params.itemIds.length === 0) {
    throw new Error("At least one VM is required")
  }

  const res = await apiFetch(`/api/v1/inventory/vms`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_ids: params.itemIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to delete selected VMs: ${res.status}`
    )
  }

  return res.json()
}

export async function submitInventoryDeleteRequest(params: {
  itemId: string
}): Promise<ApiRequestDetail> {
  const res = await apiFetch(
    `/api/v1/requests/inventory/items/${params.itemId}/vm/delete`,
    {
      method: "POST",
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to submit delete request: ${res.status}`
    )
  }

  return res.json()
}

export async function renameVM(params: {
  itemId: string
  name: string
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/rename`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: params.name }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to rename VM: ${res.status}`)
  }
}

export async function updateVMNotes(params: {
  itemId: string
  notes: string
}): Promise<{ synced: boolean }> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/notes`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: params.notes }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update VM notes: ${res.status}`)
  }
  return res.json()
}

export type ApiVmHardwareNetwork = {
  device?: string
  bridge: string
  model: string
  vlan_tag?: number
  firewall: boolean
  mac_address?: string
}

export type ApiVmHardwareConfig = {
  ostype: string
  bios: string
  machine: string
  scsi: string
  sockets: number
  cores: number
  cpu_type: string
  memory: number
  balloon: number
  storage: string
  disk_size: number
  networks: Array<ApiVmHardwareNetwork>
}

export function vmHardwareQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId, "vm", "hardware"] as const,
    queryFn: async (): Promise<ApiVmHardwareConfig> => {
      const res = await apiFetch(
        `/api/v1/inventory/items/${itemId}/vm/hardware`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error ?? `Failed to fetch VM hardware: ${res.status}`
        )
      }
      return res.json()
    },
    enabled: !!itemId,
  }
}

export async function updateVMHardware(params: {
  itemId: string
  hardware: ApiVmHardwareConfig
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/hardware`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.hardware),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update VM hardware: ${res.status}`)
  }
}

export async function cloneVM(params: {
  itemId: string
  newid: number
  name: string
  full: boolean
  target?: string
  target_folder_id: string
}): Promise<ApiVmMutationResult> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/clone`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newid: params.newid,
        name: params.name,
        full: params.full,
        target: params.target,
        target_folder_id: params.target_folder_id,
      }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to clone VM: ${res.status}`)
  }
  return res.json()
}

export async function convertToTemplate(params: {
  itemIds: Array<string>
}): Promise<ApiBulkVmMutationResponse> {
  if (params.itemIds.length === 0) {
    throw new Error("At least one VM is required")
  }

  const res = await apiFetch(`/api/v1/inventory/vms/template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_ids: params.itemIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to convert selected VMs to templates: ${res.status}`
    )
  }

  return res.json()
}

export type ApiSnapshot = {
  name: string
  description: string
  snaptime?: number
  parent?: string
  vmstate?: boolean
}

export function snapshotsQueryOptions(itemId: string) {
  return {
    queryKey: ["inventory", "item", itemId, "vm", "snapshots"] as const,
    queryFn: async (): Promise<Array<ApiSnapshot>> => {
      const res = await apiFetch(
        `/api/v1/inventory/items/${itemId}/vm/snapshots`
      )
      if (!res.ok) throw new Error(`Failed to fetch snapshots: ${res.status}`)
      return res.json()
    },
    enabled: !!itemId,
  }
}

export async function rollbackSnapshot(params: {
  itemId: string
  snapname: string
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/snapshots/rollback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapname: params.snapname }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to rollback snapshot: ${res.status}`)
  }
}

export async function submitInventorySnapshotRollbackRequest(params: {
  itemId: string
  snapname: string
}): Promise<ApiRequestDetail> {
  const res = await apiFetch(
    `/api/v1/requests/inventory/items/${params.itemId}/vm/snapshots/rollback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapname: params.snapname }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to submit snapshot rollback request: ${res.status}`
    )
  }

  return res.json()
}

export async function deleteSnapshot(params: {
  itemId: string
  snapname: string
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/snapshots/${params.snapname}`,
    { method: "DELETE" }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete snapshot: ${res.status}`)
  }
}

export async function createSnapshot(params: {
  itemId: string
  snapname: string
  description?: string
  vmstate?: boolean
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${params.itemId}/vm/snapshots`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snapname: params.snapname,
        description: params.description,
        vmstate: params.vmstate,
      }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create snapshot: ${res.status}`)
  }
}

export async function submitInventorySnapshotCreateRequest(params: {
  itemId: string
  snapname: string
}): Promise<ApiRequestDetail> {
  const res = await apiFetch(
    `/api/v1/requests/inventory/items/${params.itemId}/vm/snapshots`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapname: params.snapname }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to submit snapshot request: ${res.status}`
    )
  }

  return res.json()
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
      const res = await apiFetch(`/api/v1/proxmox/nodes/${node}/bridges`)
      if (!res.ok) throw new Error(`Failed to fetch bridges: ${res.status}`)
      return res.json()
    },
    enabled: !!node,
  }
}

export const createVmOptionsQueryOptions = {
  queryKey: ["proxmox", "create", "options"] as const,
  queryFn: async (): Promise<{
    nodes: Array<ApiNode>
    disk_storages: Array<ApiStorage>
    iso_storages: Array<ApiStorage>
    bridges: Array<ApiNetworkBridge>
    vnets: Array<ApiVNet>
  }> => {
    const res = await apiFetch("/api/v1/proxmox/create/options")
    if (!res.ok)
      throw new Error(`Failed to fetch create options: ${res.status}`)
    return res.json()
  },
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
    const res = await apiFetch("/api/v1/proxmox/nodes")
    if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status}`)
    return res.json()
  },
}

export function storagesQueryOptions(node: string) {
  return {
    queryKey: ["proxmox", "storages", node] as const,
    queryFn: async (): Promise<Array<ApiStorage>> => {
      const res = await apiFetch(`/api/v1/proxmox/nodes/${node}/storages`)
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
      const res = await apiFetch(
        `/api/v1/proxmox/nodes/${node}/storages/${storage}/isos`
      )
      if (!res.ok) throw new Error(`Failed to fetch ISOs: ${res.status}`)
      return res.json()
    },
    enabled: !!node && !!storage,
  }
}

export function createVmIsosQueryOptions(storage: string) {
  return {
    queryKey: ["proxmox", "create", "isos", storage] as const,
    queryFn: async (): Promise<Array<ApiISO>> => {
      const res = await apiFetch(`/api/v1/proxmox/create/isos/${storage}`)
      if (!res.ok) throw new Error(`Failed to fetch ISOs: ${res.status}`)
      return res.json()
    },
    enabled: !!storage,
  }
}

export async function getNextVMID(): Promise<number> {
  const res = await apiFetch("/api/v1/proxmox/nextid")
  if (!res.ok) throw new Error(`Failed to fetch next VMID: ${res.status}`)
  const data = await res.json()
  return data.vmid
}

export async function validateVMID(vmid: number): Promise<boolean> {
  const res = await apiFetch(`/api/v1/proxmox/vmid/${vmid}/validate`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to validate VM ID: ${res.status}`)
  }
  const data = await res.json()
  return !!data.valid
}

export type NetworkInterface = {
  bridge: string
  model: string
  vlan_tag?: number
  firewall: boolean
}

export type CreateVMParams = {
  target_folder_id: string
  node: string
  vmid: number
  name: string
  ostype?: string
  iso?: string
  bios?: string
  machine?: string
  scsi?: string
  sockets?: number
  cores?: number
  cpu_type?: string
  memory?: number
  balloon?: number
  storage?: string
  disk_size?: number
  networks: Array<NetworkInterface>
}

export async function createVM(
  params: CreateVMParams
): Promise<ApiVmMutationResult> {
  const res = await apiFetch("/api/v1/vms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create VM: ${res.status}`)
  }
  return res.json()
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
    const res = await apiFetch("/api/v1/sdn/vnets")
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
  const res = await apiFetch("/api/v1/sdn/vnets", {
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
  const res = await apiFetch(`/api/v1/sdn/vnets/${vnet}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update VNet: ${res.status}`)
  }
}

export async function deleteVNet(
  vnets: Array<string>
): Promise<ApiBulkDeleteResponse> {
  const res = await apiFetch("/api/v1/sdn/vnets", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vnets }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete VNets: ${res.status}`)
  }
  return res.json()
}

// --- Principals (Users & Groups) ---

export type ApiPrincipal = {
  id: string
  external_id: string
  name: string | null
  description: string | null
}

export type ApiGroupMember = {
  id: string
  principal_type: "user" | "group"
  external_id: string
  name: string | null
  description: string | null
}

export type ApiBulkDeleteFailure = {
  id: string
  error: string
}

export type ApiBulkDeleteResponse = {
  deleted: Array<string>
  failed: Array<ApiBulkDeleteFailure>
}

export type ApiBulkMembershipResponse = {
  succeeded: Array<string>
  failed: Array<ApiBulkDeleteFailure>
}

export type ApiBulkCreateFailure = {
  name: string
  error: string
}

export type ApiBulkCreateResponse = {
  successful: number
  total: number
  failures: Array<ApiBulkCreateFailure>
}

export function requestsQueryOptions(scope: ApiRequestScope) {
  return {
    queryKey: ["requests", scope] as const,
    queryFn: async (): Promise<Array<ApiRequestSummary>> => {
      const res = await apiFetch(`/api/v1/requests?scope=${scope}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch ${scope} requests: ${res.status}`)
      }
      return res.json()
    },
  }
}

export function requestDetailQueryOptions(requestId: string) {
  return {
    queryKey: ["requests", requestId] as const,
    queryFn: async (): Promise<ApiRequestDetail> => {
      const res = await apiFetch(`/api/v1/requests/${requestId}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch request: ${res.status}`)
      }
      return res.json()
    },
    enabled: !!requestId,
  }
}

export type ApiRequestActionFailure = {
  id: string
  error: string
}

export type ApiRequestActionResponse = {
  processed: Array<string>
  failed: Array<ApiRequestActionFailure>
}

export async function approveRequest(
  requestIds: Array<string>
): Promise<ApiRequestActionResponse> {
  const res = await apiFetch(`/api/v1/requests/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: requestIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to approve requests: ${res.status}`)
  }

  return res.json()
}

export async function denyRequest(
  requestIds: Array<string>
): Promise<ApiRequestActionResponse> {
  const res = await apiFetch(`/api/v1/requests/deny`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: requestIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to deny requests: ${res.status}`)
  }

  return res.json()
}

export type CreateUserInput = {
  username: string
  password: string
  description?: string
  group_ids?: Array<string>
}

export type CreateGroupInput = {
  name: string
  description?: string
}

export const usersQueryOptions = {
  queryKey: ["principals", "users"] as const,
  queryFn: async (): Promise<Array<ApiPrincipal>> => {
    const res = await apiFetch("/api/v1/principals/users")
    if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
    return res.json()
  },
}

export const groupsQueryOptions = {
  queryKey: ["principals", "groups"] as const,
  queryFn: async (): Promise<Array<ApiPrincipal>> => {
    const res = await apiFetch("/api/v1/principals/groups")
    if (!res.ok) throw new Error(`Failed to fetch groups: ${res.status}`)
    return res.json()
  },
}

export function groupMembersQueryOptions(groupId: string) {
  return {
    queryKey: ["principals", "groups", groupId, "members"] as const,
    queryFn: async (): Promise<Array<ApiGroupMember>> => {
      const res = await apiFetch(`/api/v1/principals/groups/${groupId}/members`)
      if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`)
      return res.json()
    },
    enabled: !!groupId,
  }
}

export function groupManagementAclQueryOptions(groupId: string) {
  return {
    queryKey: ["principals", "groups", groupId, "management-access"] as const,
    queryFn: async (): Promise<ApiGroupManagementAcl> => {
      const res = await apiFetch(
        `/api/v1/principals/groups/${groupId}/management-access`
      )
      if (!res.ok) {
        throw new Error(`Failed to fetch management access: ${res.status}`)
      }
      return res.json()
    },
    enabled: !!groupId,
  }
}

export async function updateGroupManagementAcl(
  groupId: string,
  grants: Array<ManagementPermissionKey>
): Promise<void> {
  const res = await apiFetch(
    `/api/v1/principals/groups/${groupId}/management-access`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grants: normalizeManagementPermissionGrants(grants),
      }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to update management access: ${res.status}`
    )
  }
}

export async function createUser(
  params: Array<CreateUserInput>
): Promise<ApiBulkCreateResponse> {
  const res = await apiFetch("/api/v1/principals/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create user: ${res.status}`)
  }

  return res.json()
}

export async function updateUser(
  id: string,
  params: { username: string; description?: string }
): Promise<void> {
  const res = await apiFetch(`/api/v1/principals/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update user: ${res.status}`)
  }
}

export async function deleteUser(
  ids: Array<string>
): Promise<ApiBulkDeleteResponse> {
  const res = await apiFetch("/api/v1/principals/users", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete users: ${res.status}`)
  }
  return res.json()
}

export async function setUserPassword(
  id: string,
  password: string
): Promise<void> {
  const res = await apiFetch(`/api/v1/principals/users/${id}/password`, {
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
  const res = await apiFetch(`/api/v1/principals/users/${id}/enable`, {
    method: "POST",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to enable user: ${res.status}`)
  }
}

export async function disableUser(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/principals/users/${id}/disable`, {
    method: "POST",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to disable user: ${res.status}`)
  }
}

export async function createGroup(
  params: Array<CreateGroupInput>
): Promise<ApiBulkCreateResponse> {
  const res = await apiFetch("/api/v1/principals/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to create group: ${res.status}`)
  }

  return res.json()
}

export async function updateGroup(
  id: string,
  params: { name: string; description?: string }
): Promise<void> {
  const res = await apiFetch(`/api/v1/principals/groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to update group: ${res.status}`)
  }
}

export async function deleteGroup(
  ids: Array<string>
): Promise<ApiBulkDeleteResponse> {
  const res = await apiFetch("/api/v1/principals/groups", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to delete groups: ${res.status}`)
  }
  return res.json()
}

export async function addGroupMember(
  groupId: string,
  memberIds: Array<string>
): Promise<ApiBulkMembershipResponse> {
  const res = await apiFetch(`/api/v1/principals/groups/${groupId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ member_ids: memberIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to add members: ${res.status}`)
  }
  return res.json()
}

export async function removeGroupMember(
  groupId: string,
  memberIds: Array<string>
): Promise<ApiBulkMembershipResponse> {
  const res = await apiFetch(`/api/v1/principals/groups/${groupId}/members`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ member_ids: memberIds }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to remove members: ${res.status}`)
  }
  return res.json()
}

export function userGroupsQueryOptions(userId: string) {
  return {
    queryKey: ["principals", "users", userId, "groups"] as const,
    queryFn: async (): Promise<Array<ApiGroupMember>> => {
      const res = await apiFetch(`/api/v1/principals/users/${userId}/groups`)
      if (!res.ok) throw new Error(`Failed to fetch user groups: ${res.status}`)
      return res.json()
    },
    enabled: !!userId,
  }
}

export async function triggerADSync(): Promise<void> {
  const res = await apiFetch("/api/v1/principals/sync", { method: "POST" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `AD sync failed: ${res.status}`)
  }
}
