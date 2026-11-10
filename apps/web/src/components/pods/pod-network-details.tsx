import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import type { ClonedPodNetwork } from "@/lib/pods/pod-types"
import { HugeiconsIcon } from "@hugeicons/react"
import type { PodNetworkSegmentKind } from "@/lib/pods/pod-networking"
import { podNetworkSegments } from "@/lib/pods/pod-network-presenters"

function NetworkItem({
  kind,
  subnet,
}: {
  kind: PodNetworkSegmentKind
  subnet: string
}) {
  const { icon, description } = podNetworkSegments[kind]

  return (
    <Item variant="muted" className="min-w-0 shadow">
      <ItemMedia>
        <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0 basis-40">
        <ItemTitle className="w-full">{kind}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {description}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="max-w-full min-w-0">
        <span className="min-w-0 wrap-anywhere">{subnet}</span>
      </ItemActions>
    </Item>
  )
}

function vnetIdentity(vnet: string, vlanTag: number | undefined) {
  return vlanTag == null ? vnet : `${vnet} · VLAN ${vlanTag}`
}

export function PodNetworkDetails({ network }: { network: ClonedPodNetwork }) {
  const isDmzProfile = network.profile_key === "lan-dmz-router-v1"

  return (
    <>
      <CardHeader>
        <CardTitle>Networking</CardTitle>
        <CardDescription>
          Pre-configured networking details for this pod.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-3 sm:gap-6">
          <NetworkItem kind="WAN" subnet={network.external_subnet} />
          {isDmzProfile ? (
            <NetworkItem
              kind="DMZ"
              subnet={vnetIdentity(network.dmz_vnet, network.dmz_vlan_tag)}
            />
          ) : null}
          <NetworkItem kind="LAN" subnet={network.internal_subnet} />
        </div>
      </CardContent>
    </>
  )
}
