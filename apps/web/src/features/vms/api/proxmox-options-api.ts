import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import type {
  ApiISO,
  ApiNetworkBridge,
  ApiNode,
  ApiStorage,
} from "../types/vm-types"
import { apiFetch } from "@/features/auth/api/auth-api"

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
      const res = await apiFetch(`/api/v1/proxmox/nodes/${node}/bridges${suffix}`)
      if (!res.ok) throw new Error(`Failed to fetch bridges: ${res.status}`)
      return res.json()
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
      const res = await apiFetch(`/api/v1/proxmox/create/options${suffix}`)
      if (!res.ok)
        throw new Error(`Failed to fetch create options: ${res.status}`)
      return res.json()
    },
  }
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
