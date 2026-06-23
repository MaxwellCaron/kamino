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
