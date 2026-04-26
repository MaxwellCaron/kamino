import type { ApiVNet } from "../types/sdn-types"
import type { ApiBulkDeleteResponse } from "@/features/principals/types/principals-types"
import { apiFetch } from "@/features/auth/api/auth-queries"

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
