import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  IconChecklist,
  IconHistory,
  IconTimelineEvent,
} from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
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
  canAccessAdmin,
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
  formatRequestScope,
  formatRequestStatus,
} from "@/components/requests/request-presenters"

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
  const roleLabel = canAccessAdmin(user.management_permissions)
    ? "Administrator"
    : "Manager"

  const pendingQuery = useQuery(requestsQueryOptions("pending"))
  const historyQuery = useQuery(requestsQueryOptions("history"))
  const detailQuery = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })

  const activeQuery = scope === "pending" ? pendingQuery : historyQuery
  const activeRequests = activeQuery.data ?? []
  const pendingCount = pendingQuery.data?.length ?? 0
  const historyCount = historyQuery.data?.length ?? 0
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
      const summary = summarizeApprovalStatus(result.status)

      queryClient.setQueryData(["requests", result.id], result)
      queryClient.invalidateQueries({ queryKey: ["requests"] })

      if (summary.variant === "error") {
        toast.error(summary.message)
      } else {
        toast.success(summary.message)
      }
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const denyMutation = useMutation({
    mutationFn: denyRequest,
    onSuccess: (result) => {
      queryClient.setQueryData(["requests", result.id], result)
      queryClient.invalidateQueries({ queryKey: ["requests"] })
      toast.success("Request denied")
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card className="overflow-hidden border-border/70 bg-linear-to-br from-card via-card to-muted/50">
          <CardHeader className="gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex max-w-2xl flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
                  <IconTimelineEvent />
                  Review Queue
                </div>
                <CardTitle className="text-4xl font-black tracking-tight">
                  Requests
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm/relaxed">
                  Managers and administrators review queued work here and every
                  decision is tracked automatically.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{roleLabel}</Badge>
                <Badge variant="secondary">{pendingCount} pending</Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Card className="border-dashed bg-background/80">
                <CardHeader className="gap-1 pb-3">
                  <CardDescription>Pending review</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {pendingQuery.isLoading ? "..." : pendingCount}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  Items that still need a manager or administrator outcome.
                </CardContent>
              </Card>
              <Card className="border-dashed bg-background/80">
                <CardHeader className="gap-1 pb-3">
                  <CardDescription>Recorded history</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {historyQuery.isLoading ? "..." : historyCount}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  Approved, denied, canceled, and executed queue items.
                </CardContent>
              </Card>
              <Card className="border-dashed bg-background/80">
                <CardHeader className="gap-1 pb-3">
                  <CardDescription>Review model</CardDescription>
                  <CardTitle className="text-3xl">Simple</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  No threaded comments, no justification forms, and no editable
                  request variables.
                </CardContent>
              </Card>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2">
                  {scope === "pending" ? (
                    <IconChecklist className="size-5 text-muted-foreground" />
                  ) : (
                    <IconHistory className="size-5 text-muted-foreground" />
                  )}
                  {formatRequestScope(scope)}
                </CardTitle>
                <CardDescription>
                  Requester and reviewer usernames are shown directly in the
                  queue.
                </CardDescription>
              </div>
              <Tabs
                value={scope}
                onValueChange={(value) => setScope(value as ApiRequestScope)}
                className="w-full lg:w-auto"
              >
                <TabsList variant="line" className="w-full lg:w-auto">
                  <TabsTrigger value="pending">
                    Pending
                    <Badge variant="outline">{pendingCount}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    History
                    <Badge variant="outline">{historyCount}</Badge>
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
        approvePending={approveMutation.isPending}
        canReview={canReview}
        denyPending={denyMutation.isPending}
        error={detailQuery.error}
        isLoading={detailQuery.isLoading}
        onApprove={() => {
          if (!selectedRequestId) {
            return
          }
          approveMutation.mutate(selectedRequestId)
        }}
        onDeny={() => {
          if (!selectedRequestId) {
            return
          }
          denyMutation.mutate(selectedRequestId)
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
