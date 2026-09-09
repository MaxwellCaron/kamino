import { getRouteApi, notFound } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import type {
  ApiInventoryItem,
  ApiTreeNode,
} from "@/features/inventory/types/inventory-types"
import {
  inventoryItemQueryOptions,
  inventoryTreeQueryOptions,
} from "@/features/inventory/api/inventory-api"
import { findInventoryTreeNode as findTreeNode } from "@/features/inventory/utils/inventory-tree"
import {
  vmOverviewQueryOptions,
  vmStatusQueryOptions,
} from "@/features/vms/api/vm-api"
import { useVmDashboardResources } from "@/features/vms/hooks/use-vm-dashboard-resources"
import { getVmCapabilities } from "@/features/inventory/utils/inventory-capabilities"
import { useIsVncSessionPinned } from "@/features/vms/components/dashboard/vnc-session-visibility-context"
import { SnapshotsTable } from "@/features/vms/components/dashboard/snapshot-table"
import { VmHeader } from "@/features/vms/components/dashboard/vm-header"
import { VmNotes } from "@/features/vms/components/dashboard/vm-notes"
import { VmPowerControls } from "@/features/vms/components/dashboard/vm-power-controls"
import { isApiErrorStatus } from "@/features/auth/api/auth-api"

const vmDashboardRouteApi = getRouteApi("/_dashboard/inventory/items/$itemId")

function findDashboardTreeNode(
  tree: Array<ApiTreeNode> | undefined,
  itemId: string
) {
  return tree ? findTreeNode(tree, itemId) : null
}

function resolveDashboardNode(
  treeNode: ApiTreeNode | null,
  item: ApiInventoryItem | undefined
): ApiTreeNode | null {
  if (treeNode) return treeNode
  if (!item) return null

  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    permissions: item.permissions,
    vm: item.vm,
  }
}

function getVmDashboardState(
  node: ApiTreeNode | null,
  vmStatuses: Record<number, string> | undefined
) {
  const vm = node?.vm ?? null
  const isTemplate = vm?.is_template ?? false
  const powerStatus = vm ? vmStatuses?.[vm.vmid] : undefined
  const isVmRunning = powerStatus === "running"

  return {
    isTemplate,
    powerStatus,
    shouldFetchOverview: !!vm,
    shouldFetchResources: !!vm && !isTemplate && isVmRunning,
    vm,
  }
}

function validateDashboardNode({
  isItemError,
  isLoading,
  itemError,
  node,
  vm,
}: {
  isItemError: boolean
  isLoading: boolean
  itemError: unknown
  node: ApiTreeNode | null
  vm: ApiTreeNode["vm"] | null
}) {
  if (isLoading) return
  if (!node && isItemError) {
    if (isApiErrorStatus(itemError, 404)) throw notFound()
    throw itemError
  }
  if (!node || !vm) throw notFound()
}

function VmDashboardContent({
  capabilities,
  itemId,
  node,
  overviewState,
  powerStatus,
  resources,
  vm,
}: {
  capabilities: ReturnType<typeof getVmCapabilities>
  itemId: string
  node: ApiTreeNode
  overviewState: {
    error: boolean
    networks: React.ComponentProps<typeof VmHeader>["networks"]
    pending: boolean
  }
  powerStatus: string | undefined
  resources: React.ComponentProps<typeof VmHeader>["resources"]
  vm: NonNullable<ApiTreeNode["vm"]>
}) {
  const isTemplate = vm.is_template

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
      <VmHeader
        node={node}
        itemId={itemId}
        vm={vm}
        powerStatus={powerStatus}
        resources={resources}
        networks={overviewState.networks}
        addresses={vm.addresses}
        isNetworksLoading={overviewState.pending}
        isNetworksError={overviewState.error}
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
      {capabilities.viewSnapshots.enabled ? (
        <SnapshotsTable
          itemId={itemId}
          vmid={vm.vmid}
          vmName={node.name}
          guestType={vm.guest_type}
          isTemplate={isTemplate}
          permissions={{
            canView: capabilities.viewSnapshots.enabled,
            canManage: capabilities.snapshot.mode === "direct",
            canRequest: capabilities.snapshot.mode === "request",
          }}
        />
      ) : null}
    </div>
  )
}

export function VmDashboardPage() {
  const { itemId } = vmDashboardRouteApi.useParams()
  const { data: tree, isLoading: isTreeLoading } = useQuery(
    inventoryTreeQueryOptions
  )
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const treeNode = findDashboardTreeNode(tree, itemId)
  const {
    data: item,
    error: itemError,
    isError: isItemError,
    isLoading: isItemLoading,
  } = useQuery({
    ...inventoryItemQueryOptions(itemId),
    enabled: !treeNode,
  })
  const node = resolveDashboardNode(treeNode, item)
  const isLoading = isTreeLoading || (!treeNode && isItemLoading)
  const {
    isTemplate,
    powerStatus,
    shouldFetchOverview,
    shouldFetchResources,
    vm,
  } = getVmDashboardState(node, vmStatuses)
  const isConsolePinned = useIsVncSessionPinned(itemId)
  const {
    data: overview,
    isError: isOverviewError,
    isPending: isOverviewPending,
  } = useQuery({
    ...vmOverviewQueryOptions(itemId),
    enabled: shouldFetchOverview,
  })
  const { data: resources } = useVmDashboardResources({
    itemId,
    enabled: shouldFetchResources && !isConsolePinned,
    overviewSettled: shouldFetchOverview && !isOverviewPending,
    initialResources: overview?.resources,
  })
  const capabilities = getVmCapabilities(node?.permissions, {
    isTemplate,
    guestType: vm?.guest_type,
  })
  validateDashboardNode({
    isItemError,
    isLoading,
    itemError,
    node,
    vm,
  })

  return (
    <div className="@container/main relative flex flex-1 flex-col gap-2">
      {node && vm ? (
        <VmDashboardContent
          capabilities={capabilities}
          itemId={itemId}
          node={node}
          overviewState={{
            error: isOverviewError,
            networks: overview?.networks,
            pending: isOverviewPending,
          }}
          powerStatus={powerStatus}
          resources={shouldFetchResources ? resources : undefined}
          vm={vm}
        />
      ) : null}
    </div>
  )
}
