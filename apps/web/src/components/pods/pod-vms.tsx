import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { ClonedPodNetwork, PodVM } from "@/lib/pods/pod-types"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@workspace/ui/components/empty"
import { animateContainer, animateTableRow } from "@/lib/motion/animate"
import { ExternalLinkIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { InventoryVmItem } from "@/components/inventory/inventory-vm-item"
import { ItemGroup } from "@workspace/ui/components/item"
import { getPodVmAddresses } from "@/lib/pods/pod-networking"
import { m } from "motion/react"

export function PodVms({
  network,
  readOnly = false,
  vms,
}: {
  network?: ClonedPodNetwork
  readOnly?: boolean
  vms: Array<PodVM>
}) {
  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Virtual Machines
        </CardTitle>
        <CardDescription>
          List of virtual machines that you currently have access to view.
          Please note that this may not represent all the virtual machines in
          the pod environment.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {vms.length > 0 ? (
          <m.div initial="hidden" animate="show" variants={animateContainer}>
            <ItemGroup>
              {vms.map((vm) => (
                <m.div key={vm.id} variants={animateTableRow}>
                  <InventoryVmItem
                    itemId={vm.inventory.itemId}
                    interactive={!readOnly}
                    name={vm.name}
                    status={vm.status}
                    cpuCount={vm.cpu_count}
                    memoryMb={vm.memory_mb}
                    diskGb={vm.disk_gb}
                    addresses={network ? getPodVmAddresses(vm, network) : []}
                    openInNewTab={!readOnly}
                    trailingContent={
                      readOnly ? null : (
                        <HugeiconsIcon
                          icon={ExternalLinkIcon}
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )
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
    </>
  )
}
