import { useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { VncConsole } from "@/components/vm/vnc-console"
import {
  InventoryPermissionBits,
  findTreeNode,
  hasInventoryPermission,
  inventoryItemQueryOptions,
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
  const navigate = useNavigate()
  const { itemId } = Route.useParams()
  const { data: tree, isLoading: isTreeLoading } = useQuery(
    inventoryTreeQueryOptions
  )
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const treeNode = tree ? findTreeNode(tree, itemId) : null
  const { data: item, isLoading: isItemLoading } = useQuery({
    ...inventoryItemQueryOptions(itemId),
    enabled: !treeNode,
  })
  const node =
    treeNode ??
    (item
      ? {
          id: item.id,
          name: item.name,
          kind: item.kind,
          permissions: item.permissions,
          vm: item.vm,
        }
      : null)
  const vm = node?.vm ?? null
  const isTemplate = vm?.is_template ?? false
  const powerStatus = vm ? vmStatuses?.[vm.vmid] : undefined
  const isLoading = isTreeLoading || (!treeNode && isItemLoading)
  const { data: resources } = useQuery({
    ...vmResourcesQueryOptions(itemId),
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
  const shouldRedirectHome = !isLoading && (!node || !vm)

  useEffect(() => {
    if (!shouldRedirectHome) return

    navigate({ to: "/", replace: true })
  }, [navigate, shouldRedirectHome])

  if (shouldRedirectHome) {
    return null
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <VmHeader
          node={node}
          itemId={itemId}
          vm={vm}
          powerStatus={powerStatus}
          resources={resources}
          isTemplate={isTemplate}
          isLoading={isLoading}
        />
        {canManageSnapshots && (
          <SnapshotsTable
            itemId={itemId}
            vmid={vm?.vmid ?? null}
            isTemplate={isTemplate}
            canManageSnapshots={canManageSnapshots}
            isLoading={isLoading}
          />
        )}
        {!isTemplate && canUseConsole && (
          <VncConsole
            key={itemId}
            itemId={itemId}
            powerStatus={powerStatus}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  )
}
