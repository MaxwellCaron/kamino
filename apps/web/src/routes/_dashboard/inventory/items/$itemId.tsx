import { useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { VncConsole } from "@/features/vms/components/dashboard/vnc-console"
import {
  inventoryItemQueryOptions,
  inventoryTreeQueryOptions,
} from "@/features/inventory/api/inventory-queries"
import { findInventoryTreeNode as findTreeNode } from "@/features/inventory/utils/inventory-tree"
import {
  vmResourcesQueryOptions,
  vmStatusQueryOptions,
} from "@/features/vms/api/vm-queries"
import { getVmCapabilities } from "@/features/inventory/utils/inventory-capabilities"
import { SnapshotsTable } from "@/features/vms/components/dashboard/snapshot-table"
import { VmHeader } from "@/features/vms/components/dashboard/vm-header"
import { VmNotes } from "@/features/vms/components/dashboard/vm-notes"
import { VmPowerControls } from "@/features/vms/components/dashboard/vm-power-controls"

export const Route = createFileRoute("/_dashboard/inventory/items/$itemId")({
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
  const isVmRunning = powerStatus === "running"
  const isLoading = isTreeLoading || (!treeNode && isItemLoading)
  const shouldFetchResources = !!vm && !isTemplate && isVmRunning
  const { data: resources } = useQuery({
    ...vmResourcesQueryOptions(itemId),
    enabled: shouldFetchResources,
  })
  const capabilities = getVmCapabilities(node?.permissions, { isTemplate })
  const canManageSnapshots = capabilities.snapshot.mode === "direct"
  const canViewSnapshots = capabilities.viewSnapshots.enabled
  const canRequestSnapshots = capabilities.snapshot.mode === "request"
  const canUseConsole = capabilities.console.enabled
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
          resources={shouldFetchResources ? resources : undefined}
          isTemplate={isTemplate}
          isLoading={isLoading}
        />
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
          <VmPowerControls
            node={node}
            itemId={itemId}
            vm={vm}
            powerStatus={powerStatus}
            isTemplate={isTemplate}
            isLoading={isLoading}
          />
          <div className="col-span-2">
            <VmNotes
              node={node}
              itemId={itemId}
              vm={vm}
              isLoading={isLoading}
            />
          </div>
        </div>
        {canViewSnapshots && (
          <SnapshotsTable
            itemId={itemId}
            vmid={vm?.vmid ?? null}
            vmName={node?.name}
            isTemplate={isTemplate}
            canViewSnapshots={canViewSnapshots}
            canManageSnapshots={canManageSnapshots}
            canRequestSnapshots={canRequestSnapshots}
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
