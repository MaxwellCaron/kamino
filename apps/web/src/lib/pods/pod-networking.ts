import type { ClonedPodNetwork } from "@/lib/pods/pod-types"
import { POD_NETWORK_PROFILES } from "./pod-networking-mode"
import type { PodCloneTarget } from "@/lib/pods/clone-targets-api"

export function podCloneTargetSupportsProfile(
  target: PodCloneTarget,
  profileKey: string
) {
  return (
    target.network_profile_key === "lan-dmz-router-v1" ||
    profileKey === "lan-router-v1"
  )
}

export function getPreferredPodCloneTarget(
  targets: Array<PodCloneTarget>,
  profileKey: string
): PodCloneTarget | null {
  const compatibleTargets = targets.filter((target) =>
    podCloneTargetSupportsProfile(target, profileKey)
  )
  const defaultTarget = compatibleTargets.find((target) => target.is_default)

  if (defaultTarget) return defaultTarget
  return compatibleTargets.length > 0 ? compatibleTargets[0] : null
}

export function getPublishNetworkProfileLabel(networkProfileKey: string) {
  return (
    POD_NETWORK_PROFILES.find((profile) => profile.key === networkProfileKey)
      ?.label ?? networkProfileKey
  )
}

export function getPublishVmNetworkLabel(vm: {
  is_router?: boolean
  segment_key?: string | null
}) {
  if (vm.is_router) return "Router"
  if (vm.segment_key === "dmz") return "DMZ"
  if (vm.segment_key === "lan") return "LAN"
  return "—"
}

function subnetPrefix(subnet: string): string | null {
  const parts = subnet.split("/")[0].split(".")
  return parts.length === 4 ? parts.slice(0, 3).join(".") : null
}

function formatHostAddress(
  subnet: string | undefined,
  hostOctet: number
): string | null {
  if (!subnet) return null
  const prefix = subnetPrefix(subnet)
  return prefix ? `${prefix}.${hostOctet}` : null
}

const podVmAddressOrder = ["WAN", "DMZ", "LAN"] as const

export type PodNetworkSegmentKind = (typeof podVmAddressOrder)[number]

export type PodVmAddress = {
  label: PodNetworkSegmentKind
  address: string
}

function sortPodVmAddresses(
  addresses: Array<PodVmAddress>
): Array<PodVmAddress> {
  return [...addresses].sort(
    (a, b) =>
      podVmAddressOrder.indexOf(a.label) - podVmAddressOrder.indexOf(b.label)
  )
}

export function getPodVmAddresses(
  vm: {
    is_router?: boolean
    segment_key?: string | null
    host_octet?: number
  },
  network: ClonedPodNetwork
): Array<PodVmAddress> {
  const addresses: Array<PodVmAddress> = []
  const isDmzProfile = network.profile_key === "lan-dmz-router-v1"

  if (vm.is_router) {
    if (network.internal_gateway) {
      addresses.push({ label: "LAN", address: network.internal_gateway })
    }
    if (isDmzProfile && network.dmz_gateway) {
      addresses.push({ label: "DMZ", address: network.dmz_gateway })
    }
    if (network.external_gateway) {
      addresses.push({ label: "WAN", address: network.external_gateway })
    }
    return sortPodVmAddresses(addresses)
  }

  if (vm.host_octet == null) return addresses

  const isDmzVm = isDmzProfile && vm.segment_key === "dmz"
  const segmentSubnet = isDmzVm ? network.dmz_subnet : network.internal_subnet

  const internalAddress = formatHostAddress(segmentSubnet, vm.host_octet)
  if (internalAddress) {
    addresses.push({
      label: isDmzVm ? "DMZ" : "LAN",
      address: internalAddress,
    })
  }

  if (network.prefix_nat && network.prefix_nat.internal === segmentSubnet) {
    const externalAddress = formatHostAddress(
      network.prefix_nat.external,
      vm.host_octet
    )
    if (externalAddress) {
      addresses.push({ label: "WAN", address: externalAddress })
    }
  }

  return sortPodVmAddresses(addresses)
}
