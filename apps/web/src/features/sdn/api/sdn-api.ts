import type { ApiSDNZone, ApiVNet } from "../types/sdn-types"
import type { ApiBulkDeleteResponse } from "@/features/shared/types/api-types"
import { apiJson, apiVoid } from "@/features/shared/api/api-json"

export const vnetsQueryOptions = {
  queryKey: ["sdn", "vnets"] as const,
  queryFn: (): Promise<Array<ApiVNet>> =>
    apiJson<Array<ApiVNet>>("/api/v1/sdn/vnets", "fetch VNets"),
}

export const sdnZonesQueryOptions = {
  queryKey: ["sdn", "zones"] as const,
  queryFn: (): Promise<Array<ApiSDNZone>> =>
    apiJson<Array<ApiSDNZone>>("/api/v1/sdn/zones", "fetch SDN zones"),
}

export async function createVNet(params: {
  vnet: string
  zone: string
  tag?: number
  alias?: string
  vlanaware?: boolean
  isolate_ports?: boolean
}): Promise<void> {
  await apiVoid("/api/v1/sdn/vnets", "create VNet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
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
  await apiVoid(`/api/v1/sdn/vnets/${vnet}`, "update VNet", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
}

export async function deleteVNet(
  vnets: Array<string>
): Promise<ApiBulkDeleteResponse> {
  return apiJson<ApiBulkDeleteResponse>("/api/v1/sdn/vnets", "delete VNets", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vnets }),
  })
}
