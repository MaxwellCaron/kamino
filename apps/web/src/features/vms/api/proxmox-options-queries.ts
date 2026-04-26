import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import type {
  ApiISO,
  ApiNetworkBridge,
  ApiNode,
  ApiStorage,
} from "../types/vm-types"
import { apiFetch } from "@/features/auth/api/auth-queries"

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
