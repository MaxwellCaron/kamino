import type {
  ApiInventoryAcl,
  ApiInventoryItem,
  ApiTreeNode,
} from "../types/inventory-types"
import {
  ApiError,
  apiFetch,
  shouldRetryApiQuery,
} from "@/features/auth/api/auth-api"

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
        throw new ApiError(
          `Failed to fetch inventory item: ${res.status}`,
          res.status
        )
      }
      return res.json()
    },
    enabled: !!itemId,
    retry: shouldRetryApiQuery,
  }
}

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

export async function moveInventoryItems(params: {
  itemIds: Array<string>
  parentId: string
}): Promise<void> {
  const res = await apiFetch("/api/v1/inventory/move/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_ids: params.itemIds,
      parent_id: params.parentId,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to move inventory items: ${res.status}`
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

export async function updateFolderVmLimit(params: {
  id: string
  vmLimit: number | null
}): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/folders/${params.id}/vm-limit`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vm_limit: params.vmLimit }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to update folder VM limit: ${res.status}`
    )
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
