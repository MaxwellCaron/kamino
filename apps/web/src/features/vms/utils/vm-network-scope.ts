import type { ApiScopedNetwork } from "@/features/vms/api/proxmox-options-api"

export function isScopedNetworkBridgeAllowed(
  scope: ApiScopedNetwork,
  bridge: string
): boolean {
  return scope.allowed_bridges.includes(bridge)
}

export function isScopedNetworkBridgeLocked(scope: ApiScopedNetwork): boolean {
  return scope.allowed_bridges.length === 1
}

type ScopableNetworkInterface = {
  bridge: string
  vlan_tag?: number
}

export function applyScopedNetworkToInterfaces<T extends ScopableNetworkInterface>(
  scope: ApiScopedNetwork,
  interfaces: Array<T>
): Array<T> {
  return interfaces.map((iface) => ({
    ...iface,
    bridge: isScopedNetworkBridgeAllowed(scope, iface.bridge)
      ? iface.bridge
      : scope.bridge,
    vlan_tag: scope.vlan_tag,
  }))
}
