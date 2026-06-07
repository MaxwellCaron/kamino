import { createFileRoute, notFound } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { VncConsole } from "@/features/vms/components/dashboard/vnc-console"
import {
  inventoryItemQueryOptions,
  inventoryTreeQueryOptions,
} from "@/features/inventory/api/inventory-api"
import { findInventoryTreeNode as findTreeNode } from "@/features/inventory/utils/inventory-tree"
import {
  vmResourcesQueryOptions,
  vmStatusQueryOptions,
} from "@/features/vms/api/vm-api"
import { getVmCapabilities } from "@/features/inventory/utils/inventory-capabilities"
import { SnapshotsTable } from "@/features/vms/components/dashboard/snapshot-table"
import { VmHeader } from "@/features/vms/components/dashboard/vm-header"
import { VmNotes } from "@/features/vms/components/dashboard/vm-notes"
import { VmPowerControls } from "@/features/vms/components/dashboard/vm-power-controls"
import { isApiErrorStatus } from "@/features/auth/api/auth-api"

export const Route = createFileRoute("/_dashboard/inventory/items/$itemId")({
  component: VmPage,
})

function VmPage() {
  const { itemId } = Route.useParams()
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
  const capabilities = getVmCapabilities(node?.permissions, { isTemplate })
  const canManageSnapshots = capabilities.snapshot.mode === "direct"
  const canViewSnapshots = capabilities.viewSnapshots.enabled
  const canRequestSnapshots = capabilities.snapshot.mode === "request"
  const canUseConsole = capabilities.console.enabled

  if (isLoading) {
    return <VmPageSkeleton />
  }

  if (!node && isItemError) {
    if (isApiErrorStatus(itemError, 404)) {
      throw notFound()
    }

    throw itemError
  }

  if (!node || !vm) {
    throw notFound()
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
        {canViewSnapshots && (
          <SnapshotsTable
            itemId={itemId}
            vmid={vm.vmid}
            vmName={node.name}
            isTemplate={isTemplate}
            canViewSnapshots={canViewSnapshots}
            canManageSnapshots={canManageSnapshots}
            canRequestSnapshots={canRequestSnapshots}
          />
        )}
        {!isTemplate && canUseConsole && (
          <VncConsole key={itemId} itemId={itemId} powerStatus={powerStatus} />
        )}
      </div>
    </div>
  )
}

function VmPageSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading virtual machine"
      className="@container/main flex flex-1 flex-col gap-2"
    >
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-10 w-64 max-w-full rounded-md" />
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-4 w-32 rounded-md" />
            </CardDescription>
            <CardAction>
              <Skeleton className="size-10 rounded-md" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid grid-cols-2 grid-rows-3 gap-4 lg:grid-cols-3 lg:grid-rows-2 lg:gap-6 2xl:grid-cols-6 2xl:grid-rows-1">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="flex min-h-28 flex-wrap items-center rounded-2xl bg-muted/50 px-4 py-3.5"
                >
                  <Skeleton className="size-5 shrink-0 rounded-md" />
                  <div className="ml-3.5 flex flex-1 flex-col gap-3">
                    <Skeleton className="h-4 w-16 rounded-md" />
                    <Skeleton className="h-7 w-20 rounded-md" />
                    <Skeleton className="h-4 w-12 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-md" />
                <Skeleton className="h-5 w-32 rounded-md" />
              </CardTitle>
            </CardHeader>
            <CardContent className="h-full">
              <div className="grid h-full grid-cols-2 grid-rows-2 gap-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="min-h-14 rounded-md" />
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Skeleton className="h-4 w-full max-w-56 rounded-md" />
            </CardFooter>
          </Card>

          <Card className="h-full lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </CardTitle>
              <CardAction>
                <Skeleton className="size-8 rounded-md" />
              </CardAction>
            </CardHeader>
            <CardContent className="mx-4 -mt-4 h-full rounded-4xl bg-muted/50 py-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-5/6 rounded-md" />
                <Skeleton className="h-4 w-2/3 rounded-md" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-md" />
              <Skeleton className="h-5 w-24 rounded-md" />
            </CardTitle>
            <CardDescription className="flex flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-full max-w-sm rounded-md" />
              <Skeleton className="h-4 w-2/3 max-w-xs rounded-md" />
            </CardDescription>
            <CardAction>
              <Skeleton className="h-10 w-24 rounded-md" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 border-b px-0">
            <div className="border-t">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="flex min-h-16 flex-col gap-3 border-b px-4 py-4 md:grid md:grid-cols-[1fr_8rem_4rem_6rem] md:items-center md:gap-4 md:py-0"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <Skeleton className="h-4 w-32 rounded-md" />
                      <Skeleton className="h-3 w-48 max-w-full rounded-md" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-24 rounded-md" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <div className="flex justify-end gap-1">
                    <Skeleton className="size-8 rounded-md" />
                    <Skeleton className="size-8 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Skeleton className="h-4 w-16 rounded-md" />
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-md" />
              <Skeleton className="h-5 w-20 rounded-md" />
            </CardTitle>
            <CardDescription className="flex flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-full max-w-lg rounded-md" />
              <Skeleton className="h-4 w-1/2 max-w-sm rounded-md" />
            </CardDescription>
            <CardAction>
              <Skeleton className="h-5 w-28 rounded-full" />
            </CardAction>
          </CardHeader>
          <CardContent className="relative flex h-[83vh] items-center justify-center bg-muted/50">
            <div className="flex w-full max-w-md flex-col items-center gap-4">
              <Skeleton className="size-12 rounded-full" />
              <Skeleton className="h-5 w-32 rounded-md" />
              <Skeleton className="h-4 w-64 rounded-md" />
              <Skeleton className="h-10 w-24 rounded-md" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
