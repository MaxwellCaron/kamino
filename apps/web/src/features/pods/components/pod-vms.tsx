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
import { ItemGroup } from "@workspace/ui/components/item"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"
import type { ClonedPodNetwork, PodVM } from "../types/pod-types"
import { InventoryVmItem } from "@/components/inventory/inventory-vm-item"
import { animateContainer, animateTableRow } from "@/components/animate"
import { formatBytes } from "@/features/shared/utils/format"

function NetworkCard({
  label,
  subnet,
  className,
}: {
  label: string
  subnet: string
  className?: string
}) {
  return (
    <Card className={cn("bg-muted shadow ring-1", className)}>
      <CardHeader>
        <CardTitle className="text-center">{label}</CardTitle>
        <CardDescription className="text-center">{subnet}</CardDescription>
      </CardHeader>
    </Card>
  )
}

function PodNetworkDetails({ network }: { network: ClonedPodNetwork }) {
  const isDmzProfile = network.profile_key === "lan-dmz-router-v1"

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-6",
        isDmzProfile ? "sm:grid-cols-4" : "sm:grid-cols-3"
      )}
    >
      <NetworkCard label="VNet" subnet={network.vnet} />
      <NetworkCard label="External" subnet={network.external_subnet} />
      {isDmzProfile ? (
        <NetworkCard label="DMZ" subnet={network.dmz_subnet} />
      ) : null}
      <NetworkCard
        className={!isDmzProfile ? "col-span-2 sm:col-span-1" : undefined}
        label="Internal"
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
                    cpuCount={
                      vm.resources.maxcpu > 0 ? vm.resources.maxcpu : undefined
                    }
                    memoryLabel={
                      vm.resources.maxmem > 0
                        ? formatBytes(vm.resources.maxmem)
                        : undefined
                    }
                    diskLabel={
                      vm.resources.maxdisk > 0
                        ? formatBytes(vm.resources.maxdisk)
                        : undefined
                    }
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
