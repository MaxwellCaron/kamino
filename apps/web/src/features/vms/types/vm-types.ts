export type VmResources = {
  cpu: number
  maxcpu: number
  mem: number
  maxmem: number
  disk: number
  maxdisk: number
  netin: number
  netout: number
  diskread: number
  diskwrite: number
  uptime: number
}

export type ApiBulkVmMutationFailure = {
  id: string
  error: string
}

export type ApiBulkVmMutationResponse = {
  succeeded: Array<string>
  failed: Array<ApiBulkVmMutationFailure>
}

export type ApiVmHardwareNetwork = {
  device?: string
  bridge: string
  model: string
  vlan_tag?: number
  firewall: boolean
  mac_address?: string
}

export type ApiVmHardwareConfig = {
  ostype: string
  bios: string
  machine: string
  scsi: string
  sockets: number
  cores: number
  cpu_type: string
  memory: number
  balloon: number
  storage: string
  disk_size: number
  networks: Array<ApiVmHardwareNetwork>
}

export type ApiVmNetworkSummary = {
  device?: string
  bridge: string
}

export type ApiVmNetworksResponse = {
  networks: Array<ApiVmNetworkSummary>
}

export type ApiSnapshot = {
  name: string
  description: string
  snaptime?: number
  parent?: string
  vmstate?: boolean
}

export type ApiNode = {
  node: string
  status: string
  cpu: number
  maxcpu: number
  mem: number
  maxmem: number
}

export type ApiNetworkBridge = {
  iface: string
  type: string
  active?: number
  comments?: string
}

export type ApiStorage = {
  storage: string
  type: string
  content: string
  avail: number
  total: number
  used: number
  shared?: number
}

export type ApiISO = {
  volid: string
  format: string
  size: number
}

export type NetworkInterface = {
  bridge: string
  model: string
  vlan_tag?: number
  firewall: boolean
}

export type CreateVMParams = {
  target_folder_id: string
  node: string
  vmid: number
  name: string
  ostype?: string
  iso?: string
  bios?: string
  machine?: string
  scsi?: string
  sockets?: number
  cores?: number
  cpu_type?: string
  memory?: number
  balloon?: number
  storage?: string
  disk_size?: number
  networks: Array<NetworkInterface>
}
