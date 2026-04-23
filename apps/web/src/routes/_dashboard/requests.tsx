import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  IconCheck,
  IconCheckbox,
  IconClock,
  IconReceipt,
  IconX,
} from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import type { ConfirmConfig } from "@/components/inventory/inventory-confirm-actions"
import type {
  ApiRequestScope,
  ApiRequestStatus,
  ApiRequestSummary,
} from "@/lib/queries"
import { ConfirmDialog } from "@/components/inventory/inventory-confirm-actions"
import {
  ManagementPermissionKeys,
  approveRequest,
  canAccessRequestQueue,
  denyRequest,
  hasManagementPermission,
  inventoryTreeQueryOptions,
  requestDetailQueryOptions,
  requestsQueryOptions,
} from "@/lib/queries"
import { DataTable } from "@/components/data-table/data-table"
import { RequestDetailDialog } from "@/components/requests/request-detail-dialog"
import { getRequestColumns } from "@/components/requests/requests-columns"
import {
  STATUS_ICONS,
  formatRequestKind,
  formatRequestScope,
  formatRequestStatus,
  getRequestStatusClassName,
} from "@/components/requests/request-presenters"
import { LoadingTransition } from "@/components/loading-transition"
import { formatVmReference } from "@/lib/utils"

export const Route = createFileRoute("/_dashboard/requests")({
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/" })
    }
  },
  component: RequestsPage,
})

function getRequestLabel(request: ApiRequestSummary) {
  const itemName = request.inventory?.item_name
  const vmid = request.inventory?.vmid
  const kind = formatRequestKind(request.kind)

  if (vmid && itemName) {
    return `${formatVmReference(vmid, itemName)} (${kind})`
  }

  return kind
}

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
      description: `Are you sure you want to ${action} ${requests.length} requests?`,
      statusItems: requests.map((r) => ({
        id: r.id,
        kind: "vm",
        label: getRequestLabel(r),
        status: "idle",
      })),
      onConfirm: async (controls) => {
        const items = controls.getStatusItems()
        const ids = items.map((i) => i.id)

        controls.setStatusItems((prev) =>
          prev.map((i) => ({ ...i, status: "pending" }))
        )

        try {
          const result = await mutation.mutateAsync(ids)
          const failedMap = new Map(result.failed.map((f) => [f.id, f.error]))

          controls.setStatusItems((prev) =>
            prev.map((i) => {
              const error = failedMap.get(i.id)
              return {
                ...i,
                status: error ? ("error" as const) : ("success" as const),
                error,
              }
            })
          )

          if (result.failed.length === 0) {
            clearSelection()
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Action failed"
          controls.setStatusItems((prev) =>
            prev.map((i) => ({ ...i, status: "error", error: message }))
          )
        }
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

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6 2xl:grid-cols-5">
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
                    className={cn(
                      status === "pending" && "col-span-2 2xl:col-span-1"
                    )}
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
              getRowId={(request) => request.id}
              renderSelectionActions={
                canReview && scope === "pending"
                  ? ({ clearSelection, selectedRows }) => (
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
            success: (result) => {
              if (result.failed.length > 0) {
                throw new Error(result.failed[0].error)
              }
              return "Request approved"
            },
            error: (err: Error) => err.message,
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
            error: (err: Error) => err.message,
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
