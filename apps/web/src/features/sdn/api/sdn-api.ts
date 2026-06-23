import type { ApiSDNZone, ApiVNet } from "../types/sdn-types"
import type { ApiBulkDeleteResponse } from "@/features/shared/types/api-types"
import { apiFetch } from "@/features/auth/api/auth-api"

export const vnetsQueryOptions = {
  queryKey: ["sdn", "vnets"] as const,
  queryFn: async (): Promise<Array<ApiVNet>> => {
    const res = await apiFetch("/api/v1/sdn/vnets")
    if (!res.ok) throw new Error(`Failed to fetch VNets: ${res.status}`)
    return res.json()
  },
}

export const sdnZonesQueryOptions = {
  queryKey: ["sdn", "zones"] as const,
  queryFn: async (): Promise<Array<ApiSDNZone>> => {
    const res = await apiFetch("/api/v1/sdn/zones")
    if (!res.ok) throw new Error(`Failed to fetch SDN zones: ${res.status}`)
    return res.json()
  },
}

export async function createVNet(params: {
  vnet: string
  zone: string
  tag?: number
  alias?: string
  vlanaware?: boolean
  isolate_ports?: boolean
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
  params: {
    zone?: string
    tag?: number
    alias?: string
    vlanaware?: boolean
    isolate_ports?: boolean
  }
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
