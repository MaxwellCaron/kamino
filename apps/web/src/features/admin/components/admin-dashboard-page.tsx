import { useMemo } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconChartBar,
  IconClock,
  IconCpu,
  IconDatabase,
  IconFolder,
  IconGauge,
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Progress, ProgressLabel } from "@workspace/ui/components/progress"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import type { ApiNode, ApiStorage } from "@/features/vms/types/vm-types"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import { requestsQueryOptions } from "@/features/requests/api/requests-api"
import {
  formatRequestKind,
  formatRequestStatus,
  getRequestIcon,
} from "@/features/requests/utils/request-presenters"
import { formatBytes } from "@/features/shared/utils/format"
import {
  nodesQueryOptions,
  storagesQueryOptions,
} from "@/features/vms/api/proxmox-options-api"

type InventoryCounts = {
  folders: number
  templates: number
  vms: number
}

type Capacity = {
  total: number
  used: number
}

type PrincipalListItem = {
  created_at?: string | null
  description?: string | null
  external_id: string
  id: string
  name: string | null
  type: "group" | "user"
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

function sortByNewest<T extends { created_at?: string | null }>(
  items: Array<T>
) {
  return [...items].sort(
    (left, right) => timestamp(right.created_at) - timestamp(left.created_at)
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

function percentage(used: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (used / total) * 100))
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function formatCapacity(used: number, total: number) {
  if (total <= 0) return "-"
  return `${formatBytes(used)} / ${formatBytes(total)}`
}

function formatCpuCapacity(used: number, total: number) {
  if (total <= 0) return "-"
  return `${used.toFixed(1)} / ${total} cores`
}

function requestTargetLabel(request: ApiRequestSummary) {
  return request.inventory?.item_name ?? request.inventory?.vmid ?? "Request"
}

function statusBadgeVariant(status: string) {
  return status === "online" ? "secondary" : "outline"
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

function capacitySeverity(value: number) {
  if (value >= 90) return "Critical"
  if (value >= 75) return "Elevated"
  return "Nominal"
}

function StatCard({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string
  icon: typeof IconUser
  label: string
  value: number | string
}) {
  return (
    <Card size="sm" className="min-h-32">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <Icon className="text-muted-foreground" />
        </CardAction>
        <CardTitle className="font-mono text-3xl tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function CapacityBar({
  formatUsage = formatCapacity,
  label,
  total,
  used,
}: {
  formatUsage?: (used: number, total: number) => string
  label: string
  total: number
  used: number
}) {
  const value = percentage(used, total)

  return (
    <Progress value={value} className="gap-2">
      <ProgressLabel className="text-sm">{label}</ProgressLabel>
      <span className="ml-auto text-sm text-muted-foreground tabular-nums">
        {formatPercent(value)}
      </span>
      <div className="basis-full text-xs text-muted-foreground">
        {formatUsage(used, total)}
      </div>
    </Progress>
  )
}

function RequestList({
  empty,
  requests,
}: {
  empty: string
  requests: Array<ApiRequestSummary>
}) {
  if (requests.length === 0) {
    return (
      <Empty className="min-h-40 rounded-lg border border-dashed">
        <EmptyHeader>
          <EmptyTitle>No requests</EmptyTitle>
          <EmptyDescription>{empty}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {requests.map((request) => {
        const Icon = getRequestIcon(
          request.kind,
          request.inventory?.power_action
        )
        return (
          <div
            key={request.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-muted/20 p-3"
          >
            <div className="flex size-9 items-center justify-center rounded-md bg-background">
              <Icon className="text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {formatRequestKind(request.kind)}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {request.requester_username} - {requestTargetLabel(request)}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs">
              <Badge variant="outline">
                {formatRequestStatus(request.status)}
              </Badge>
              <RelativeTimeCard
                date={
                  request.updated_at ??
                  request.reviewed_at ??
                  request.created_at ??
                  new Date().toISOString()
                }
                display="relative"
                timezones={["UTC"]}
                delay={50}
                closeDelay={150}
                variant="muted"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PrincipalList({
  principals,
}: {
  principals: Array<PrincipalListItem>
}) {
  if (principals.length === 0) {
    return (
      <Empty className="min-h-40 rounded-lg border border-dashed">
        <EmptyHeader>
          <EmptyTitle>No principals</EmptyTitle>
          <EmptyDescription>
            Newly created users and groups appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {principals.map((principal) => {
        const Icon = principal.type === "user" ? IconUser : IconUsersGroup
        return (
          <div
            key={principal.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-muted/20 p-3"
          >
            <div className="flex size-9 items-center justify-center rounded-md bg-background">
              <Icon className="text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {principal.name ?? principal.external_id}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {principal.type === "user" ? "User" : "Group"}
                {principal.description ? ` - ${principal.description}` : ""}
              </div>
            </div>
            {principal.created_at ? (
              <RelativeTimeCard
                date={principal.created_at}
                display="relative"
                timezones={["UTC"]}
                delay={50}
                closeDelay={150}
                variant="muted"
              />
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </div>
        )
      })}
    </div>
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
      <Empty className="min-h-56 rounded-lg border border-dashed">
        <EmptyHeader>
          <EmptyTitle>No nodes reported</EmptyTitle>
          <EmptyDescription>
            Proxmox did not return any managed cluster nodes.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Node</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>CPU</TableHead>
          <TableHead>Memory</TableHead>
          <TableHead>Storage</TableHead>
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
              <TableCell className="font-medium">{node.node}</TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(node.status)}>
                  {node.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex min-w-32 flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {cpuUsed.toFixed(1)} / {node.maxcpu} cores
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatPercent(node.cpu * 100)}
                    </span>
                  </div>
                  <Progress value={node.cpu * 100} />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex min-w-36 flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {formatCapacity(node.mem, node.maxmem)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatPercent(memoryValue)}
                    </span>
                  </div>
                  <Progress value={memoryValue} />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex min-w-36 flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {formatCapacity(storage.used, storage.total)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatPercent(storageValue)}
                    </span>
                  </div>
                  <Progress value={storageValue} />
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function AdminDashboardPage() {
  const usersQuery = useQuery(usersQueryOptions)
  const groupsQuery = useQuery(groupsQueryOptions)
  const inventoryQuery = useQuery(inventoryTreeQueryOptions)
  const pendingRequestsQuery = useQuery(requestsQueryOptions("pending"))
  const completedRequestsQuery = useQuery(requestsQueryOptions("completed"))
  const nodesQuery = useQuery(nodesQueryOptions)

  const storageQueries = useQueries({
    queries: (nodesQuery.data ?? []).map((node) =>
      storagesQueryOptions(node.node)
    ),
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

  const recentPrincipals = useMemo(
    () =>
      sortByNewest<PrincipalListItem>([
        ...(usersQuery.data ?? []).map((user) => ({
          ...user,
          type: "user" as const,
        })),
        ...(groupsQuery.data ?? []).map((group) => ({
          ...group,
          type: "group" as const,
        })),
      ]).slice(0, 5),
    [groupsQuery.data, usersQuery.data]
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
  const totalRequests =
    (pendingRequestsQuery.data?.length ?? 0) +
    (completedRequestsQuery.data?.length ?? 0)
  const offlineNodes = nodes.filter((node) => node.status !== "online").length
  const cpuPercent = percentage(cpuUsed, cpuTotal)
  const memoryPercent = percentage(memoryUsed, memoryTotal)
  const storagePercent = percentage(clusterStorage.used, clusterStorage.total)
  const pressure = Math.max(cpuPercent, memoryPercent, storagePercent)
  const capacitySummary = [
    {
      label: "CPU cores",
      used: cpuUsed,
      total: cpuTotal,
      value: cpuPercent,
      formatUsage: formatCpuCapacity,
    },
    {
      label: "Memory",
      used: memoryUsed,
      total: memoryTotal,
      value: memoryPercent,
      formatUsage: formatCapacity,
    },
    {
      label: "Storage",
      used: clusterStorage.used,
      total: clusterStorage.total,
      value: storagePercent,
      formatUsage: formatCapacity,
    },
  ]

  const stats = [
    {
      label: "Users",
      value: usersQuery.data?.length ?? "-",
      description: "Principal accounts with direct login or identity mapping.",
      icon: IconUser,
    },
    {
      label: "Groups",
      value: groupsQuery.data?.length ?? "-",
      description: "Access groups available for RBAC and inventory ACLs.",
      icon: IconUsersGroup,
    },
    {
      label: "Folders",
      value: inventoryQuery.isLoading ? "-" : inventoryCounts.folders,
      description: "Inventory folders organizing visible infrastructure.",
      icon: IconFolder,
    },
    {
      label: "Virtual Machines",
      value: inventoryQuery.isLoading ? "-" : inventoryCounts.vms,
      description: `${inventoryCounts.templates} templates tracked separately.`,
      icon: IconServer,
    },
    {
      label: "Requests",
      value:
        pendingRequestsQuery.isLoading || completedRequestsQuery.isLoading
          ? "-"
          : totalRequests,
      description: `${pendingRequestsQuery.data?.length ?? 0} currently pending review.`,
      icon: IconReceipt,
    },
  ]

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Admin Dashboard
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Control-plane health, request flow, principal growth, and Proxmox
            cluster capacity in one view.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          <IconGauge />
          {capacitySeverity(pressure)} pressure
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid flex-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle>Cluster Capacity</CardTitle>
            <CardDescription>
              Aggregate usage across managed Proxmox nodes.
            </CardDescription>
            <CardAction>
              <IconChartBar className="text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-3">
            <CapacityBar
              label="CPU"
              used={cpuUsed}
              total={cpuTotal}
              formatUsage={formatCpuCapacity}
            />
            <CapacityBar label="Memory" used={memoryUsed} total={memoryTotal} />
            <CapacityBar
              label="Storage"
              used={clusterStorage.used}
              total={clusterStorage.total}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle>Operational Signals</CardTitle>
            <CardDescription>
              Conditions that usually need administrator attention.
            </CardDescription>
            <CardAction>
              <IconAlertTriangle className="text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Pending</div>
              <div className="font-mono text-2xl tabular-nums">
                {pendingRequestsQuery.data?.length ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Offline Nodes</div>
              <div className="font-mono text-2xl tabular-nums">
                {offlineNodes}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Templates</div>
              <div className="font-mono text-2xl tabular-nums">
                {inventoryCounts.templates}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-6">
          <CardHeader>
            <CardTitle>Pending Requests</CardTitle>
            <CardDescription>
              Newest requests waiting for review.
            </CardDescription>
            <CardAction>
              <Link
                to="/manager/requests"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                Queue
                <IconArrowUpRight />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <RequestList
              requests={pendingRequests}
              empty="The review queue is clear."
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-6">
          <CardHeader>
            <CardTitle>Accepted Requests</CardTitle>
            <CardDescription>
              Last five approved or executed requests.
            </CardDescription>
            <CardAction>
              <IconClock className="text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <RequestList
              requests={acceptedRequests}
              empty="No accepted requests have been recorded yet."
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>Recent Principals</CardTitle>
            <CardDescription>
              Last five created users and groups.
            </CardDescription>
            <CardAction>
              <IconUsersGroup className="text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <PrincipalList principals={recentPrincipals} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-8">
          <CardHeader>
            <CardTitle>Proxmox Nodes</CardTitle>
            <CardDescription>
              Status and current CPU, memory, and storage usage for every node.
            </CardDescription>
            <CardAction>
              <IconCpu className="text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <NodeTable nodes={nodes} storageByNode={storageByNode} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-12">
          <CardHeader>
            <CardTitle>Capacity Summary</CardTitle>
            <CardDescription>
              Quick scan of the largest cluster resource pools.
            </CardDescription>
            <CardAction>
              <IconDatabase className="text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {capacitySummary.map((item) => (
              <div
                key={item.label}
                className={cn(
                  "rounded-lg border bg-muted/20 p-4",
                  item.value >= 90 && "border-destructive/50"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="font-mono text-sm tabular-nums">
                    {formatPercent(item.value)}
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {item.formatUsage(item.used, item.total)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
