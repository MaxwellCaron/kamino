import type { ApiVNet } from "@/features/sdn/types/sdn-types"
import type {
  ApiISO,
  ApiNetworkBridge,
  ApiNode,
  ApiStorage,
} from "../types/vm-types"
import { apiJson } from "@/features/shared/api/api-json"

export type ApiScopedNetwork = {
  bridge: string
  allowed_bridges: Array<string>
  vlan_tag: number
}

export type ApiVMTemplateOption = {
  id: string
  name: string
  node: string
  vmid: number
}

type CreateVMOptions = {
  nodes: Array<ApiNode>
  disk_storages: Array<ApiStorage>
  iso_storages: Array<ApiStorage>
  bridges: Array<ApiNetworkBridge>
  vnets: Array<ApiVNet>
  scoped_network?: ApiScopedNetwork
  templates: Array<ApiVMTemplateOption>
}

export function bridgesQueryOptions(node: string, scopeItemId?: string) {
  return {
    queryKey: ["proxmox", "bridges", node, scopeItemId ?? ""] as const,
    queryFn: async (): Promise<{
      bridges: Array<ApiNetworkBridge>
      vnets: Array<ApiVNet>
      scoped_network?: ApiScopedNetwork
    }> => {
      const params = new URLSearchParams()
      if (scopeItemId) {
        params.set("scope_item_id", scopeItemId)
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : ""
      return apiJson<{
        bridges: Array<ApiNetworkBridge>
        vnets: Array<ApiVNet>
        scoped_network?: ApiScopedNetwork
      }>(`/api/v1/proxmox/nodes/${node}/bridges${suffix}`, "fetch bridges")
    },
    enabled: !!node,
  }
}

export function createVmOptionsQueryOptions(
  scopeItemId: string,
  enabled: boolean
) {
  return {
    queryKey: ["proxmox", "create", "options", scopeItemId] as const,
    queryFn: async ({
      signal,
    }: {
      signal: AbortSignal
    }): Promise<CreateVMOptions> => {
      const params = new URLSearchParams({ scope_item_id: scopeItemId })
      return apiJson<CreateVMOptions>(
        `/api/v1/proxmox/create/options?${params.toString()}`,
        "fetch create options",
        {
          signal,
        }
      )
    },
    enabled: enabled && !!scopeItemId,
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
