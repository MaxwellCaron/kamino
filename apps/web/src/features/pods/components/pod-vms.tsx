import { m } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon, ExternalLinkIcon } from "@hugeicons/core-free-icons"
import {
  Card,
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
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"
import { getPodVmAddresses, podNetworkSegments } from "../utils/pod-networking"
import type { PodNetworkSegmentKind } from "../utils/pod-networking"
import type { ClonedPodNetwork, PodVM } from "../types/pod-types"
import { InventoryVmItem } from "@/components/inventory/inventory-vm-item"
import { animateContainer, animateTableRow } from "@/components/animate"

function NetworkItem({
  kind,
  subnet,
  className,
}: {
  kind: PodNetworkSegmentKind
  subnet: string
  className?: string
}) {
  const { icon, description } = podNetworkSegments[kind]

  return (
    <Item variant="muted" className={cn("shadow", className)}>
      <ItemMedia>
        <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="w-full">{kind}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>{subnet}</ItemActions>
    </Item>
  )
}

function vnetIdentity(vnet: string, vlanTag: number | undefined) {
  return vlanTag == null ? vnet : `${vnet} · VLAN ${vlanTag}`
}

function PodNetworkDetails({ network }: { network: ClonedPodNetwork }) {
  const isDmzProfile = network.profile_key === "lan-dmz-router-v1"

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-6",
        isDmzProfile ? "lg:grid-cols-3" : "sm:grid-cols-2"
      )}
    >
      <NetworkItem kind="WAN" subnet={network.external_subnet} />
      {isDmzProfile ? (
        <NetworkItem
          kind="DMZ"
          subnet={vnetIdentity(network.dmz_vnet, network.dmz_vlan_tag)}
        />
      ) : null}
      <NetworkItem
        className={!isDmzProfile ? "col-span-2 sm:col-span-1" : undefined}
        kind="LAN"
        subnet={network.internal_subnet}
      />
    </div>
  )
}

export function PodVms({
  network,
  vms,
}: {
  network?: ClonedPodNetwork
  vms: Array<PodVM>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={ComputerIcon}
            className="text-muted-foreground"
          />
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Virtual Machines
          </span>
        </CardTitle>
        <CardDescription>
          List of virtual machines that you currently have access to view.
          Please note that this may not represent all the virtual machines in
          the pod environment.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {network ? <PodNetworkDetails network={network} /> : null}
        {vms.length > 0 ? (
          <m.div initial="hidden" animate="show" variants={animateContainer}>
            <ItemGroup>
              {vms.map((vm) => (
                <m.div key={vm.id} variants={animateTableRow}>
                  <InventoryVmItem
                    itemId={vm.inventory.itemId}
                    name={vm.name}
                    status={vm.status}
                    cpuCount={vm.cpu_count}
                    memoryMb={vm.memory_mb}
                    diskGb={vm.disk_gb}
                    addresses={network ? getPodVmAddresses(vm, network) : []}
                    openInNewTab
                    trailingContent={
                      <HugeiconsIcon
                        icon={ExternalLinkIcon}
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    }
                  />
                </m.div>
              ))}
            </ItemGroup>
          </m.div>
        ) : (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyDescription>
                No virtual machines are available.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
