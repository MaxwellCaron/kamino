import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { IconCheckbox, IconClock, IconReceipt } from "@tabler/icons-react"
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
import type { ApiRequestScope, ApiRequestStatus } from "@/lib/queries"
import {
  ManagementPermissionKeys,
  approveRequest,
  canAccessRequestQueue,
  denyRequest,
  hasManagementPermission,
  requestDetailQueryOptions,
  requestsQueryOptions,
} from "@/lib/queries"
import { DataTable } from "@/components/data-table/data-table"
import { RequestDetailDialog } from "@/components/requests/request-detail-dialog"
import { getRequestColumns } from "@/components/requests/requests-columns"
import {
  STATUS_ICONS,
  formatRequestScope,
  formatRequestStatus,
  getRequestStatusClassName,
} from "@/components/requests/request-presenters"
import { LoadingTransition } from "@/components/loading-transition"

export const Route = createFileRoute("/_dashboard/requests")({
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/" })
    }
  },
  component: RequestsPage,
})

function summarizeApprovalStatus(status: ApiRequestStatus) {
  if (status === "executed") {
    return { message: "Request approved", variant: "success" as const }
  }
  if (status === "execution_failed") {
    return {
      message: "Request approved, but execution failed",
      variant: "error" as const,
    }
  }

  return {
    message: `Request moved to ${formatRequestStatus(status).toLowerCase()}`,
    variant: "success" as const,
  }
}

function RequestsPage() {
  const { user } = Route.useRouteContext()
  const [scope, setScope] = useState<ApiRequestScope>("pending")
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )
  const queryClient = useQueryClient()
  const canReview = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.manager
  )

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
      }),
    []
  )

  const approveMutation = useMutation({
    mutationFn: approveRequest,
    onSuccess: (result) => {
      queryClient.setQueryData(["requests", result.id], result)
      queryClient.invalidateQueries({ queryKey: ["requests"] })
    },
  })

  const denyMutation = useMutation({
    mutationFn: denyRequest,
    onSuccess: (result) => {
      queryClient.setQueryData(["requests", result.id], result)
      queryClient.invalidateQueries({ queryKey: ["requests"] })
    },
  })

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
          toast.promise(approveMutation.mutateAsync(id), {
            loading: "Approving request...",
            success: (result) => summarizeApprovalStatus(result.status).message,
            error: (err: Error) => err.message,
          })
        }}
        onDeny={() => {
          if (!selectedRequestId) {
            return
          }
          const id = selectedRequestId
          setSelectedRequestId(null)
          toast.promise(denyMutation.mutateAsync(id), {
            loading: "Denying request...",
            success: "Request denied",
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
      />
    </div>
  )
}
