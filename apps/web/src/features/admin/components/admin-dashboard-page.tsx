import { useMemo, useState } from "react"
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  IconArrowUpRight,
  IconChartBar,
  IconClock,
  IconCpu,
  IconFolder,
  IconPackages,
  IconReceipt,
  IconServer,
  IconUser,
  IconUsersGroup,
} from "@tabler/icons-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { PieCenter } from "@workspace/ui/components/charts/pie-center"
import { PieChart } from "@workspace/ui/components/charts/pie-chart"
import { PieSlice } from "@workspace/ui/components/charts/pie-slice"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
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
  ProgressIndicator,
  ProgressRoot,
  ProgressTrack,
} from "@workspace/ui/components/progress"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { toast } from "sonner"

import { CapacityChart } from "./capacity-donut-chart"
import { AdminDashboardHeader } from "./admin-dashboard-header"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { AuthUser } from "@/features/auth/types/auth-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import type { ApiNode, ApiStorage } from "@/features/vms/types/vm-types"
import {
  ManagementPermissionKeys,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import {
  approveRequest,
  denyRequest,
  requestDetailQueryOptions,
  requestsQueryOptions,
} from "@/features/requests/api/requests-api"
import { RequestDetailDialog } from "@/features/requests/components/request-detail-dialog"
import { getRequestColumns } from "@/features/requests/components/requests-columns"
import { formatBytes } from "@/features/shared/utils/format"
import {
  nodesQueryOptions,
  storagesQueryOptions,
} from "@/features/vms/api/proxmox-options-api"
import { SimpleDataTable } from "@/components/data-table/simple-data-table"

function percentage(used: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (used / total) * 100))
}

type InventoryCounts = {
  folders: number
  templates: number
  vms: number
}

type Capacity = {
  total: number
  used: number
}

function countInventory(nodes: Array<ApiTreeNode>): InventoryCounts {
  return nodes.reduce<InventoryCounts>(
    (counts, node) => {
      if (node.kind === "folder") {
        counts.folders += 1
      }

      if (node.kind === "vm") {
        if (node.vm?.is_template) {
          counts.templates += 1
        } else {
          counts.vms += 1
        }
      }

      if (node.children?.length) {
        const childCounts = countInventory(node.children)
        counts.folders += childCounts.folders
        counts.templates += childCounts.templates
        counts.vms += childCounts.vms
      }

      return counts
    },
    { folders: 0, templates: 0, vms: 0 }
  )
}

function timestamp(value?: string | null) {
  return value ? new Date(value).getTime() : 0
}

function requestTimestamp(request: ApiRequestSummary) {
  return timestamp(
    request.reviewed_at ??
      request.executed_at ??
      request.updated_at ??
      request.created_at
  )
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function formatCores(v: number) {
  return `${v.toFixed(1)} CPU`
}

function statusBadgeVariant(status: string) {
  return status === "online" ? "default" : "destructive"
}

function sumStorage(storages: Array<ApiStorage> | undefined): Capacity {
  return (storages ?? []).reduce<Capacity>(
    (capacity, storage) => ({
      total: capacity.total + storage.total,
      used: capacity.used + storage.used,
    }),
    { total: 0, used: 0 }
  )
}

function NodeTable({
  nodes,
  storageByNode,
}: {
  nodes: Array<ApiNode>
  storageByNode: Map<string, Capacity>
}) {
  if (nodes.length === 0) {
    return (
      <Empty className="min-h-56 rounded-xl border border-dashed">
        <EmptyHeader>
          <EmptyTitle className="scroll-m-20 text-xl font-semibold tracking-tight">
            No nodes reported
          </EmptyTitle>
          <EmptyDescription className="text-sm text-muted-foreground">
            Proxmox did not return any managed cluster nodes.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted hover:bg-muted">
          <TableHead className="font-mediu6 pl-6">Node</TableHead>
          <TableHead className="font-medium">Status</TableHead>
          <TableHead className="font-medium">CPU</TableHead>
          <TableHead className="font-medium">Memory</TableHead>
          <TableHead className="pr-6 font-medium">Storage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nodes.map((node) => {
          const cpuUsed = node.cpu * node.maxcpu
          const memoryValue = percentage(node.mem, node.maxmem)
          const storage = storageByNode.get(node.node) ?? { total: 0, used: 0 }
          const storageValue = percentage(storage.used, storage.total)

          return (
            <TableRow key={node.node}>
              <TableCell className="pl-6 font-medium">{node.node}</TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(node.status)}>
                  {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex min-w-32 flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {cpuUsed.toFixed(1)} CPUs / {node.maxcpu} CPUs
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatPercent(node.cpu * 100)}
                    </span>
                  </div>
                  <ProgressRoot value={node.cpu * 100}>
                    <ProgressTrack>
                      <ProgressIndicator className="bg-chart-1 dark:bg-chart-1" />
                    </ProgressTrack>
                  </ProgressRoot>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex min-w-36 flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {formatBytes(node.mem)} / {formatBytes(node.maxmem)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatPercent(memoryValue)}
                    </span>
                  </div>
                  <ProgressRoot value={memoryValue}>
                    <ProgressTrack>
                      <ProgressIndicator className="bg-chart-2 dark:bg-chart-2" />
                    </ProgressTrack>
                  </ProgressRoot>
                </div>
              </TableCell>
              <TableCell className="pr-6">
                <div className="flex min-w-36 flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {formatBytes(storage.used)} / {formatBytes(storage.total)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatPercent(storageValue)}
                    </span>
                  </div>
                  <ProgressRoot value={storageValue}>
                    <ProgressTrack>
                      <ProgressIndicator className="bg-chart-3 dark:bg-chart-3" />
                    </ProgressTrack>
                  </ProgressRoot>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function formatMutationError(error: unknown) {
  return error instanceof Error ? error.message : "Request action failed"
}

export function AdminDashboardPage({ user }: { user: AuthUser }) {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )
  const queryClient = useQueryClient()
  const usersQuery = useQuery(usersQueryOptions)
  const groupsQuery = useQuery(groupsQueryOptions)
  const inventoryQuery = useQuery(inventoryTreeQueryOptions)
  const pendingRequestsQuery = useQuery(requestsQueryOptions("pending"))
  const completedRequestsQuery = useQuery(requestsQueryOptions("completed"))
  const nodesQuery = useQuery(nodesQueryOptions)
  const detailQuery = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })
  const canReview = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.manager
  )

  const storageQueries = useQueries({
    queries: (nodesQuery.data ?? []).map((node) =>
      storagesQueryOptions(node.node)
    ),
  })

  const requestColumns = useMemo(
    () =>
      getRequestColumns({
        onOpen: (request) => setSelectedRequestId(request.id),
        selectable: false,
        tree: inventoryQuery.data,
      }),
    [inventoryQuery.data]
  )

  const approveMutation = useMutation({
    mutationFn: approveRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] })
    },
  })

  const denyMutation = useMutation({
    mutationFn: denyRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] })
    },
  })

  const inventoryCounts = useMemo(
    () => countInventory(inventoryQuery.data ?? []),
    [inventoryQuery.data]
  )

  const acceptedRequests = useMemo(
    () =>
      [...(completedRequestsQuery.data ?? [])]
        .filter(
          (request) =>
            request.status === "approved" || request.status === "executed"
        )
        .sort((left, right) => requestTimestamp(right) - requestTimestamp(left))
        .slice(0, 5),
    [completedRequestsQuery.data]
  )

  const pendingRequests = useMemo(
    () =>
      [...(pendingRequestsQuery.data ?? [])]
        .sort((left, right) => requestTimestamp(right) - requestTimestamp(left))
        .slice(0, 5),
    [pendingRequestsQuery.data]
  )

  const recentUsers = useMemo(
    () =>
      [...(usersQuery.data ?? [])]
        .sort(
          (left, right) =>
            timestamp(right.created_at) - timestamp(left.created_at)
        )
        .slice(0, 5),
    [usersQuery.data]
  )

  const recentGroups = useMemo(
    () =>
      [...(groupsQuery.data ?? [])]
        .sort(
          (left, right) =>
            timestamp(right.created_at) - timestamp(left.created_at)
        )
        .slice(0, 5),
    [groupsQuery.data]
  )

  const storageByNode = useMemo(() => {
    const result = new Map<string, Capacity>()
    ;(nodesQuery.data ?? []).forEach((node, index) => {
      result.set(node.node, sumStorage(storageQueries[index]?.data))
    })
    return result
  }, [nodesQuery.data, storageQueries])

  const clusterStorage = useMemo(
    () =>
      Array.from(storageByNode.values()).reduce<Capacity>(
        (capacity, storage) => ({
          total: capacity.total + storage.total,
          used: capacity.used + storage.used,
        }),
        { total: 0, used: 0 }
      ),
    [storageByNode]
  )

  const nodes = nodesQuery.data ?? []
  const cpuTotal = nodes.reduce((total, node) => total + node.maxcpu, 0)
  const cpuUsed = nodes.reduce(
    (total, node) => total + node.cpu * node.maxcpu,
    0
  )
  const memoryTotal = nodes.reduce((total, node) => total + node.maxmem, 0)
  const memoryUsed = nodes.reduce((total, node) => total + node.mem, 0)

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <AdminDashboardHeader
          isLoading={
            pendingRequestsQuery.isLoading || completedRequestsQuery.isLoading
          }
        />

        <Card className="pb-0.5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconPackages className="text-muted-foreground" />
              <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
                Cluster
              </span>
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Aggregate usage across managed Proxmox nodes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-around py-6">
              <CapacityChart
                label="CPU"
                used={cpuUsed}
                total={cpuTotal}
                color="var(--chart-1)"
                formatValue={formatCores}
              />
              <CapacityChart
                label="Memory"
                used={memoryUsed}
                total={memoryTotal}
                color="var(--chart-2)"
              />
              <CapacityChart
                label="Storage"
                used={clusterStorage.used}
                total={clusterStorage.total}
                color="var(--chart-3)"
              />
            </div>

            <div className="-mx-6 mt-6 border-t">
              <NodeTable nodes={nodes} storageByNode={storageByNode} />
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-6">
          <CardHeader>
            <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
              Pending Requests
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Newest requests waiting for review.
            </CardDescription>
            <CardAction>
              <Link
                to="/manager/requests"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Queue
                <IconArrowUpRight className="size-4" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <SimpleDataTable
              columns={requestColumns}
              data={pendingRequests}
              error={pendingRequestsQuery.error}
              getRowId={(request: ApiRequestSummary) => request.id}
              isLoading={pendingRequestsQuery.isLoading}
              skeletonRows={3}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-6">
          <CardHeader>
            <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
              Accepted Requests
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Last five approved or executed requests.
            </CardDescription>
            <CardAction>
              <IconClock className="text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <SimpleDataTable
              columns={requestColumns}
              data={acceptedRequests}
              error={completedRequestsQuery.error}
              getRowId={(request: ApiRequestSummary) => request.id}
              isLoading={completedRequestsQuery.isLoading}
              skeletonRows={3}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-6">
          <CardHeader>
            <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
              Recent Users
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Last five created user principals.
            </CardDescription>
            <CardAction>
              <Link
                to="/admin/principals/users"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Directory
                <IconArrowUpRight className="size-4" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {recentUsers.length === 0 ? (
                <Empty className="min-h-32 rounded-xl border border-dashed">
                  <EmptyHeader>
                    <EmptyTitle className="scroll-m-20 text-lg font-semibold tracking-tight">
                      No users
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                recentUsers.map((user) => (
                  <Item key={user.id} variant="outline" size="sm">
                    <ItemMedia variant="icon">
                      <IconUser className="text-muted-foreground" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{user.name ?? user.external_id}</ItemTitle>
                      <ItemDescription>{user.description}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {user.created_at && (
                        <RelativeTimeCard
                          date={user.created_at}
                          display="relative"
                          timezones={["UTC"]}
                          delay={50}
                          closeDelay={150}
                          variant="muted"
                        />
                      )}
                    </ItemActions>
                  </Item>
                ))
              )}
            </ItemGroup>
          </CardContent>
        </Card>

        <Card className="xl:col-span-6">
          <CardHeader>
            <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
              Recent Groups
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Last five created group principals.
            </CardDescription>
            <CardAction>
              <Link
                to="/admin/principals/groups"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Directory
                <IconArrowUpRight className="size-4" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {recentGroups.length === 0 ? (
                <Empty className="min-h-32 rounded-xl border border-dashed">
                  <EmptyHeader>
                    <EmptyTitle className="scroll-m-20 text-lg font-semibold tracking-tight">
                      No groups
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                recentGroups.map((group) => (
                  <Item key={group.id} variant="outline" size="sm">
                    <ItemMedia variant="icon">
                      <IconUsersGroup className="text-muted-foreground" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{group.name ?? group.external_id}</ItemTitle>
                      <ItemDescription>{group.description}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {group.created_at && (
                        <RelativeTimeCard
                          date={group.created_at}
                          display="relative"
                          timezones={["UTC"]}
                          delay={50}
                          closeDelay={150}
                          variant="muted"
                        />
                      )}
                    </ItemActions>
                  </Item>
                ))
              )}
            </ItemGroup>
          </CardContent>
        </Card>
      </div>

      <RequestDetailDialog
        canReview={canReview}
        error={detailQuery.error}
        isLoading={detailQuery.isLoading}
        onApprove={() => {
          if (!selectedRequestId) {
            return
          }
          const id = selectedRequestId
          setSelectedRequestId(null)
          toast.promise(approveMutation.mutateAsync([id]), {
            loading: "Approving request...",
            success: (result) => {
              if (result.failed.length > 0) {
                throw new Error(result.failed[0].error)
              }
              return "Request approved"
            },
            error: formatMutationError,
          })
        }}
        onDeny={() => {
          if (!selectedRequestId) {
            return
          }
          const id = selectedRequestId
          setSelectedRequestId(null)
          toast.promise(denyMutation.mutateAsync([id]), {
            loading: "Denying request...",
            success: (result) => {
              if (result.failed.length > 0) {
                throw new Error(result.failed[0].error)
              }
              return "Request denied"
            },
            error: formatMutationError,
          })
        }}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequestId(null)
          }
        }}
        open={selectedRequestId !== null}
        request={detailQuery.data ?? null}
        tree={inventoryQuery.data}
      />
    </div>
  )
}
