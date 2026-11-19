export type ApiVNet = {
  vnet: string
  zone: string
  tag?: number
  alias?: string
  type?: string
  vlanaware?: boolean
  isolate_ports?: boolean
}

export type ApiSDNZone = {
  zone: string
  type?: string
}

export type CreateVNetInput = {
  vnet: string
  zone: string
  tag?: number
  alias?: string
  vlanaware?: boolean
  isolate_ports?: boolean
}

export type ApiCreateVNetFailure = {
  id: string
  error: string
}

export type ApiCreateVNetsResponse = {
  created: Array<string>
  failed: Array<ApiCreateVNetFailure>
}
