import {
  BrickWallShieldIcon,
  Globe02Icon,
  HomeWifiIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import type { PodNetworkSegmentKind } from "@/lib/pods/pod-networking"

export const podNetworkSegments: Record<
  PodNetworkSegmentKind,
  { icon: IconSvgElement; description: string }
> = {
  WAN: {
    icon: Globe02Icon,
    description: "Reachable from outside the pod network.",
  },
  DMZ: {
    icon: BrickWallShieldIcon,
    description: "Exposed segment for internet-facing workloads.",
  },
  LAN: {
    icon: HomeWifiIcon,
    description: "Isolated network for the pod's workloads.",
  },
}
