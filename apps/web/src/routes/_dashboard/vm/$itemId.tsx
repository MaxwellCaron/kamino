import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { VncConsole } from "@/components/vm/vnc-console"
import {
  InventoryPermissionBits,
  findTreeNode,
  hasInventoryPermission,
  inventoryTreeQueryOptions,
  vmResourcesQueryOptions,
  vmStatusQueryOptions,
} from "@/lib/queries"
import { SnapshotsTable } from "@/components/vm/snapshot-table"
import { VmHeader } from "@/components/vm/vm-header"

export const Route = createFileRoute("/_dashboard/vm/$itemId")({
  component: VmPage,
})

function VmPage() {
  const { itemId } = Route.useParams()
  const { data: tree, isLoading } = useQuery(inventoryTreeQueryOptions)
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const node = tree ? findTreeNode(tree, itemId) : null

  if (!isLoading && !node) {
    return (
      <div className="flex flex-1 items-center justify-center text-destructive">
        Item not found
      </div>
    )
  }

  if (!isLoading && node && !node.vm) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        This item is not a virtual machine.
      </div>
    )
  }

  const vm = node?.vm ?? null
  const isTemplate = vm?.is_template ?? false
  const powerStatus = vm ? vmStatuses?.[vm.vmid] : undefined
  const { data: resources } = useQuery({
    ...vmResourcesQueryOptions(vm?.node ?? "", vm?.vmid ?? 0),
    enabled: !!vm && !isTemplate && powerStatus === "running",
  })
  const canManageSnapshots = hasInventoryPermission(
    node?.permissions,
    InventoryPermissionBits.snapshotVm
  )
  const canUseConsole = hasInventoryPermission(
    node?.permissions,
    InventoryPermissionBits.consoleVm
  )

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <VmHeader
          node={node}
          vm={vm}
          powerStatus={powerStatus}
          resources={resources}
          isTemplate={isTemplate}
          isLoading={isLoading}
        />
        {canManageSnapshots && (
          <SnapshotsTable
            node={vm?.node ?? null}
            vmid={vm?.vmid ?? null}
            isTemplate={isTemplate}
            canManageSnapshots={canManageSnapshots}
            isLoading={isLoading}
          />
        )}
        {!isTemplate && canUseConsole && (
          <VncConsole
            key={vm?.vmid ?? "loading"}
            node={vm?.node ?? null}
            vmid={vm?.vmid ?? null}
            powerStatus={powerStatus}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  )
}
