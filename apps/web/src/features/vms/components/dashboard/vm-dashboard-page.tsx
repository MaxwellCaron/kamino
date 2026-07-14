import { getRouteApi, notFound } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { PreloadOverlay } from "@/components/loading-overlay"
import {
  inventoryItemQueryOptions,
  inventoryTreeQueryOptions,
} from "@/features/inventory/api/inventory-api"
import { findInventoryTreeNode as findTreeNode } from "@/features/inventory/utils/inventory-tree"
import {
  vmNetworksQueryOptions,
  vmResourcesQueryOptions,
  vmStatusQueryOptions,
} from "@/features/vms/api/vm-api"
import { getVmCapabilities } from "@/features/inventory/utils/inventory-capabilities"
import { SnapshotsTable } from "@/features/vms/components/dashboard/snapshot-table"
import { VmHeader } from "@/features/vms/components/dashboard/vm-header"
import { VmNotes } from "@/features/vms/components/dashboard/vm-notes"
import { VmPowerControls } from "@/features/vms/components/dashboard/vm-power-controls"
import { isApiErrorStatus } from "@/features/auth/api/auth-api"

const vmDashboardRouteApi = getRouteApi("/_dashboard/inventory/items/$itemId")

export function VmDashboardPage() {
  const { itemId } = vmDashboardRouteApi.useParams()
  const { data: tree, isLoading: isTreeLoading } = useQuery(
    inventoryTreeQueryOptions
  )
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const treeNode = tree ? findTreeNode(tree, itemId) : null
  const {
    data: item,
    error: itemError,
    isError: isItemError,
    isLoading: isItemLoading,
  } = useQuery({
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
  const shouldFetchNetworks = !!vm
  const {
    data: networks,
    isError: isNetworksError,
    isLoading: isNetworksLoading,
  } = useQuery({
    ...vmNetworksQueryOptions(itemId),
    enabled: shouldFetchNetworks,
  })
  const capabilities = getVmCapabilities(node?.permissions, {
    isTemplate,
    guestType: vm?.guest_type,
  })
  const canManageSnapshots = capabilities.snapshot.mode === "direct"
  const canViewSnapshots = capabilities.viewSnapshots.enabled
  const canRequestSnapshots = capabilities.snapshot.mode === "request"
  if (!isLoading) {
    if (!node && isItemError) {
      if (isApiErrorStatus(itemError, 404)) {
        throw notFound()
      }

      throw itemError
    }

    if (!node || !vm) {
      throw notFound()
    }
  }

  return (
    <div className="@container/main relative flex flex-1 flex-col gap-2">
      <PreloadOverlay active={isLoading} label="Loading virtual machine" />
      {node && vm && (
        <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
          <VmHeader
            node={node}
            itemId={itemId}
            vm={vm}
            powerStatus={powerStatus}
            resources={shouldFetchResources ? resources : undefined}
            networks={networks?.networks}
            isNetworksLoading={isNetworksLoading}
            isNetworksError={isNetworksError}
            isTemplate={isTemplate}
          />
          <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
            <VmPowerControls
              node={node}
              itemId={itemId}
              vm={vm}
              powerStatus={powerStatus}
              isTemplate={isTemplate}
            />
            <div className={isTemplate ? "lg:col-span-3" : "lg:col-span-2"}>
              <VmNotes node={node} itemId={itemId} vm={vm} />
            </div>
          </div>
          {capabilities.viewSnapshots.enabled && (
            <SnapshotsTable
              itemId={itemId}
              vmid={vm.vmid}
              vmName={node.name}
              guestType={vm.guest_type}
              isTemplate={isTemplate}
              permissions={{
                canView: canViewSnapshots,
                canManage: canManageSnapshots,
                canRequest: canRequestSnapshots,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
