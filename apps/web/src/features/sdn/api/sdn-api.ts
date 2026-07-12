import type {
  ApiCreateVNetsResponse,
  ApiSDNZone,
  ApiVNet,
  CreateVNetInput,
} from "../types/sdn-types"
import type { ApiBulkDeleteResponse } from "@/features/shared/types/api-types"
import { apiJson, apiVoid } from "@/features/shared/api/api-json"

export const BULK_CREATE_VNETS_CHUNK_SIZE = 50

function chunkCreateVNetInputs(
  params: Array<CreateVNetInput>
): Array<Array<CreateVNetInput>> {
  const chunks: Array<Array<CreateVNetInput>> = []
  for (
    let index = 0;
    index < params.length;
    index += BULK_CREATE_VNETS_CHUNK_SIZE
  ) {
    chunks.push(params.slice(index, index + BULK_CREATE_VNETS_CHUNK_SIZE))
  }
  return chunks
}

function applySearchParam(options?: { apply?: boolean }) {
  return options?.apply === false ? "?apply=false" : ""
}

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

export async function createVNet(
  params: CreateVNetInput,
  options?: { apply?: boolean }
): Promise<void> {
  await apiVoid(
    `/api/v1/sdn/vnets${applySearchParam(options)}`,
    "create VNet",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }
  )
}

export async function createVNets(
  params: Array<CreateVNetInput>,
  options?: { apply?: boolean }
): Promise<ApiCreateVNetsResponse> {
  return apiJson<ApiCreateVNetsResponse>(
    `/api/v1/sdn/vnets/bulk${applySearchParam(options)}`,
    "create VNets",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vnets: params }),
    }
  )
}

export async function createVNetsInChunks(
  params: Array<CreateVNetInput>,
  options?: { apply?: boolean }
): Promise<ApiCreateVNetsResponse> {
  const results = await Promise.all(
    chunkCreateVNetInputs(params).map((chunk) => createVNets(chunk, options))
  )

  return {
    created: results.flatMap((result) => result.created),
    failed: results.flatMap((result) => result.failed),
  }
}

export async function applySDN(): Promise<void> {
  await apiVoid("/api/v1/sdn/apply", "apply SDN configuration", {
    method: "POST",
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
  vnets: Array<string>,
  options?: { apply?: boolean }
): Promise<ApiBulkDeleteResponse> {
  return apiJson<ApiBulkDeleteResponse>(
    `/api/v1/sdn/vnets${applySearchParam(options)}`,
    "delete VNets",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vnets }),
    }
  )
}
