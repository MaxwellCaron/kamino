import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import type {
  ApiISO,
  ApiNetworkBridge,
  ApiNode,
  ApiStorage,
} from "../types/vm-types"
import { apiJson } from "@/features/shared/api/api-json"

export function bridgesQueryOptions(node: string, scopeItemId?: string) {
  return {
    queryKey: ["proxmox", "bridges", node, scopeItemId ?? ""] as const,
    queryFn: async (): Promise<{
      bridges: Array<ApiNetworkBridge>
      vnets: Array<ApiVNet>
    }> => {
      const params = new URLSearchParams()
      if (scopeItemId) {
        params.set("scope_item_id", scopeItemId)
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : ""
      return apiJson<{
        bridges: Array<ApiNetworkBridge>
        vnets: Array<ApiVNet>
      }>(`/api/v1/proxmox/nodes/${node}/bridges${suffix}`, "fetch bridges")
    },
    enabled: !!node,
  }
}

export function createVmOptionsQueryOptions(scopeItemId?: string) {
  return {
    queryKey: ["proxmox", "create", "options", scopeItemId ?? ""] as const,
    queryFn: async (): Promise<{
      nodes: Array<ApiNode>
      disk_storages: Array<ApiStorage>
      iso_storages: Array<ApiStorage>
      bridges: Array<ApiNetworkBridge>
      vnets: Array<ApiVNet>
    }> => {
      const params = new URLSearchParams()
      if (scopeItemId) {
        params.set("scope_item_id", scopeItemId)
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : ""
      return apiJson<{
        nodes: Array<ApiNode>
        disk_storages: Array<ApiStorage>
        iso_storages: Array<ApiStorage>
        bridges: Array<ApiNetworkBridge>
        vnets: Array<ApiVNet>
      }>(`/api/v1/proxmox/create/options${suffix}`, "fetch create options")
    },
  }
}

export const nodesQueryOptions = {
  queryKey: ["proxmox", "nodes"] as const,
  queryFn: (): Promise<Array<ApiNode>> =>
    apiJson<Array<ApiNode>>("/api/v1/proxmox/nodes", "fetch nodes"),
}

export function storagesQueryOptions(node: string) {
  return {
    queryKey: ["proxmox", "storages", node] as const,
    queryFn: (): Promise<Array<ApiStorage>> =>
      apiJson<Array<ApiStorage>>(
        `/api/v1/proxmox/nodes/${node}/storages`,
        "fetch storages"
      ),
    enabled: !!node,
  }
}

export function createVmIsosQueryOptions(storage: string) {
  return {
    queryKey: ["proxmox", "create", "isos", storage] as const,
    queryFn: (): Promise<Array<ApiISO>> =>
      apiJson<Array<ApiISO>>(
        `/api/v1/proxmox/create/isos/${storage}`,
        "fetch ISOs"
      ),
    enabled: !!storage,
  }
}
