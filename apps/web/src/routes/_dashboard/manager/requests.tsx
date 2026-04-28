import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import {
  IconCheck,
  IconCheckbox,
  IconClock,
  IconReceipt,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { PieChart } from "@workspace/ui/components/charts/pie-chart"
import { PieSlice } from "@workspace/ui/components/charts/pie-slice"
import { PieCenter } from "@workspace/ui/components/charts/pie-center"
import { cn } from "@workspace/ui/lib/utils"

import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type {
  ApiRequestActionResponse,
  ApiRequestScope,
  ApiRequestStatus,
  ApiRequestSummary,
} from "@/features/requests/types/request-types"
import type {
  ConfirmConfig,
  ConfirmDialogControls,
  ConfirmStatusItem,
} from "@/components/dialogs/confirm-dialog"
import {
  ManagementPermissionKeys,
  canAccessRequestQueue,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { findTreePath } from "@/features/inventory/utils/inventory-tree"
import {
  approveRequest,
  denyRequest,
  requestDetailQueryOptions,
  requestsQueryOptions,
} from "@/features/requests/api/requests-api"
import { RequestDetailDialog } from "@/features/requests/components/request-detail-dialog"
import { getRequestColumns } from "@/features/requests/components/requests-columns"
import {
  STATUS_ICONS,
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestScope,
  formatRequestStatus,
  getRequestIcon,
  getRequestStatusClassName,
} from "@/features/requests/utils/request-presenters"
import {
  formatToastError,
  formatVmReference,
} from "@/features/shared/utils/format"

import { DataTable } from "@/components/data-table/data-table"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { LoadingTransition } from "@/components/loading-transition"

export const Route = createFileRoute("/_dashboard/manager/requests")({
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/" })
    }
  },
  component: RequestsPage,
})

function RequestsPage() {
  const { user } = Route.useRouteContext()
  const [scope, setScope] = useState<ApiRequestScope>("pending")
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const queryClient = useQueryClient()
  const canReview = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.manager
  )

  const treeQuery = useQuery(inventoryTreeQueryOptions)
  const pendingQuery = useQuery(requestsQueryOptions("pending"))
  const completedQuery = useQuery(requestsQueryOptions("completed"))
  const detailQuery = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })

  const activeQuery = scope === "pending" ? pendingQuery : completedQuery
  const activeRequests = activeQuery.data ?? []
  const pendingCount = pendingQuery.data?.length ?? 0
  const completedCount = completedQuery.data?.length ?? 0
  const statusCounts = useMemo(() => {
    const counts: Record<ApiRequestStatus, number> = {
      pending: 0,
      approved: 0,
      denied: 0,
      executed: 0,
      execution_failed: 0,
    }

    pendingQuery.data?.forEach((r) => {
      counts[r.status]++
    })
    completedQuery.data?.forEach((r) => {
      counts[r.status]++
    })

    return counts
  }, [pendingQuery.data, completedQuery.data])

  const chartData = useMemo(() => {
    const statusClasses: Record<ApiRequestStatus, string> = {
      pending: "fill-yellow-600/75 dark:fill-yellow-400/75",
      approved: "fill-purple-600/75 dark:fill-purple-400/75",
      denied: "fill-red-600/75 dark:fill-red-400/75",
      executed: "fill-green-600/75 dark:fill-green-400/75",
      execution_failed: "fill-orange-600/75 dark:fill-orange-400/75",
    }

    return Object.entries(statusCounts)
      .map(([status, value]) => ({
        label: formatRequestStatus(status as ApiRequestStatus),
        value,
        className: statusClasses[status as ApiRequestStatus],
      }))
      .filter((item) => item.value > 0)
  }, [statusCounts])

  const openRequest = (requestId: string) => setSelectedRequestId(requestId)

  const columns = useMemo(
    () =>
      getRequestColumns({
        onOpen: (request) => openRequest(request.id),
        tree: treeQuery.data,
      }),
    [treeQuery.data]
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

  const handleBulkAction = (
    action: "approve" | "deny",
    requests: Array<ApiRequestSummary>,
    clearSelection: () => void
  ) => {
    const isApprove = action === "approve"
    const mutation = isApprove ? approveMutation : denyMutation
    const title = isApprove ? "Approve Requests" : "Deny Requests"
    const icon = isApprove ? IconCheck : IconX
    const actionLabel = isApprove ? "Approve" : "Deny"
    const variant = isApprove ? "default" : ("destructive" as const)

    setConfirm({
      title,
      icon,
      actionLabel,
      variant,
      closeOnSuccess: !isApprove,
      description: `Are you sure you want to ${action} ${requests.length} requests?`,
      statusItems: isApprove
        ? requests.map((r) => {
            const powerAction = formatRequestPowerAction(
              r.inventory?.power_action
            )
            const Icon = getRequestIcon(r.kind, r.inventory?.power_action)
            const tree = treeQuery.data ?? []
            const path = r.inventory?.item_id
              ? findTreePath(tree, r.inventory.item_id)
              : null

            const pathLabel = path
              ? path
                  .slice(1, -1)
                  .map((n: ApiTreeNode) => n.name)
                  .join(" / ")
              : null

            return {
              id: r.id,
              kind: "vm",
              icon: Icon,
              label: (
                <div className="font-medium">
                  {powerAction ||
                    (r.inventory?.snapshot_name ? (
                      <span>
                        {formatRequestKind(r.kind)}: {r.inventory.snapshot_name}
                      </span>
                    ) : (
                      formatRequestKind(r.kind)
                    ))}
                </div>
              ),
              description: (
                <span className="truncate">
                  {pathLabel}
                  {" / "}
                  {r.inventory?.vmid &&
                    formatVmReference(r.inventory.vmid, r.inventory.item_name)}
                </span>
              ),
              status: "idle",
            }
          })
        : undefined,
      onConfirm: async (controls: ConfirmDialogControls) => {
        if (!isApprove) {
          const ids = requests.map((r) => r.id)
          mutation.mutate(ids)
          clearSelection()
          return
        }

        const items = controls.getStatusItems()

        controls.setStatusItems((prev) =>
          prev.map((i) => ({ ...i, status: "pending" }))
        )

        await Promise.allSettled(
          items.map(async (item: ConfirmStatusItem) => {
            try {
              const result: ApiRequestActionResponse =
                await mutation.mutateAsync([item.id])
              const failed = result.failed.find((f) => f.id === item.id)

              controls.setStatusItems((prev) =>
                prev.map((i) =>
                  i.id === item.id
                    ? {
                        ...i,
                        status: failed
                          ? ("error" as const)
                          : ("success" as const),
                        error: failed?.error,
                      }
                    : i
                )
              )
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Action failed"
              controls.setStatusItems((prev) =>
                prev.map((i) =>
                  i.id === item.id
                    ? { ...i, status: "error", error: message }
                    : i
                )
              )
            }
          })
        )
        clearSelection()
      },
    })
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card className="overflow-hidden border-border/70 bg-linear-to-br from-card via-card to-muted/50">
          <CardHeader className="gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex max-w-2xl flex-col gap-3">
                <CardTitle className="flex items-center gap-2 text-4xl font-black tracking-tight">
                  <IconReceipt className="size-7 text-muted-foreground" />
                  Requests
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm/relaxed">
                  Managers and administrators review queued user requests.
                </CardDescription>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="col-span-3 grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-3 lg:gap-6">
                {(
                  [
                    "pending",
                    "approved",
                    "denied",
                    "executed",
                    "execution_failed",
                  ] as Array<ApiRequestStatus>
                ).map((status) => {
                  const StatusIcon = STATUS_ICONS[status]

                  return (
                    <Item
                      key={status}
                      variant="muted"
                      className={cn(status === "pending" && "col-span-2")}
                    >
                      <ItemMedia
                        className={cn(
                          "size-6 rounded-full border-transparent!",
                          getRequestStatusClassName(status)
                        )}
                      >
                        <StatusIcon className="size-4" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{formatRequestStatus(status)}</ItemTitle>
                      </ItemContent>
                      <ItemFooter>
                        <LoadingTransition
                          isLoading={
                            pendingQuery.isLoading || completedQuery.isLoading
                          }
                          fallback={
                            <div className="space-y-2">
                              <Skeleton className="h-8 w-12 rounded-md" />
                            </div>
                          }
                        >
                          <div>
                            <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
                              {statusCounts[status]}
                            </h3>
                          </div>
                        </LoadingTransition>
                      </ItemFooter>
                    </Item>
                  )
                })}
              </div>
              <div className="col-span-3 lg:col-span-1">
                <Card className="h-full bg-muted/50 shadow-none ring-0">
                  <CardContent className="flex h-full items-center justify-center">
                    <PieChart data={chartData} size={200} innerRadius={60}>
                      {chartData.map((_, index) => (
                        <PieSlice key={index} index={index} />
                      ))}
                      <PieCenter defaultLabel="Requests" />
                    </PieChart>
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2">
                  {scope === "pending" ? (
                    <IconClock className="size-5 text-muted-foreground" />
                  ) : (
                    <IconCheckbox className="size-5 text-muted-foreground" />
                  )}
                  {formatRequestScope(scope)}
                </CardTitle>
                <CardDescription>
                  {scope === "pending"
                    ? "Pending requests are those that have not been approved or denied yet."
                    : "Completed requests are those that have been approved or denied."}
                </CardDescription>
              </div>
              <Tabs
                value={scope}
                onValueChange={(value) => setScope(value as ApiRequestScope)}
                className="w-full lg:w-auto"
              >
                <TabsList className="w-full lg:w-auto">
                  <TabsTrigger value="pending">
                    Pending
                    <Badge variant="outline">{pendingCount}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="completed">
                    Completed
                    <Badge variant="outline">{completedCount}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={activeRequests}
              isLoading={activeQuery.isLoading}
              error={activeQuery.error}
              getRowId={(request: ApiRequestSummary) => request.id}
              renderSelectionActions={
                canReview && scope === "pending"
                  ? ({
                      clearSelection,
                      selectedRows,
                    }: {
                      clearSelection: () => void
                      selectedRows: Array<ApiRequestSummary>
                    }) => (
                      <>
                        <ActionBarItem
                          onSelect={(event) => event.preventDefault()}
                          onClick={() =>
                            handleBulkAction(
                              "approve",
                              selectedRows,
                              clearSelection
                            )
                          }
                          aria-label="Approve selected requests"
                          tooltip="Approve"
                          variant="default"
                        >
                          <IconCheck />
                        </ActionBarItem>
                        <ActionBarSeparator />
                        <ActionBarItem
                          onSelect={(event) => event.preventDefault()}
                          onClick={() =>
                            handleBulkAction(
                              "deny",
                              selectedRows,
                              clearSelection
                            )
                          }
                          aria-label="Deny selected requests"
                          tooltip="Deny"
                          variant="destructive"
                        >
                          <IconX />
                        </ActionBarItem>
                      </>
                    )
                  : undefined
              }
            />
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
            success: (result: ApiRequestActionResponse) => {
              if (result.failed.length > 0) {
                throw new Error(result.failed[0].error)
              }
              return "Request approved"
            },
            error: formatToastError,
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
            success: (result: ApiRequestActionResponse) => {
              if (result.failed.length > 0) {
                throw new Error(result.failed[0].error)
              }
              return "Request denied"
            },
            error: formatToastError,
          })
        }}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequestId(null)
          }
        }}
        open={selectedRequestId !== null}
        request={detailQuery.data ?? null}
        tree={treeQuery.data}
      />

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
