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
import { apiJson, apiVoid } from "@/features/shared/api/api-json"

async function fetchInventoryTree(): Promise<Array<ApiTreeNode>> {
  return apiJson<Array<ApiTreeNode>>("/api/v1/inventory/tree", "fetch inventory")
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
        const body = await res.json().catch(() => ({}))
        throw new ApiError(
          body.error ?? `Failed to fetch inventory item: ${res.status}`,
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
    queryFn: (): Promise<ApiInventoryAcl> =>
      apiJson<ApiInventoryAcl>(
        `/api/v1/inventory/items/${itemId}/acl`,
        "fetch inventory ACL"
      ),
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
  await apiVoid(`/api/v1/inventory/items/${params.itemId}/acl`, "update inventory ACL", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entries: params.entries,
    }),
  })
}

export async function moveInventoryItems(params: {
  itemIds: Array<string>
  parentId: string
}): Promise<void> {
  await apiVoid("/api/v1/inventory/move/bulk", "move inventory items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_ids: params.itemIds,
      parent_id: params.parentId,
    }),
  })
}

export async function createFolder(params: {
  parentId: string
  name: string
}): Promise<void> {
  await apiVoid("/api/v1/inventory/folders", "create folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parent_id: params.parentId,
      name: params.name,
    }),
  })
}

export async function renameFolder(params: {
  id: string
  name: string
  description?: string
}): Promise<void> {
  await apiVoid(`/api/v1/inventory/folders/${params.id}/rename`, "rename folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      description: params.description ?? "",
    }),
  })
}

export async function updateFolderVmLimit(params: {
  id: string
  vmLimit: number | null
}): Promise<void> {
  await apiVoid(
    `/api/v1/inventory/folders/${params.id}/vm-limit`,
    "update folder VM limit",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vm_limit: params.vmLimit }),
    }
  )
}

export async function deleteFolder(params: { id: string }): Promise<void> {
  await apiVoid(`/api/v1/inventory/folders/${params.id}`, "delete folder", {
    method: "DELETE",
  })
}
