import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getRouteApi } from "@tanstack/react-router"
import { toast } from "sonner"

import { RequestsPageSkeleton } from "./requests-page-skeleton"
import { RequestsPageOverviewCard } from "./requests-page-overview-card"
import { RequestsPageQueueCard } from "./requests-page-queue-card"
import { RequestsPageDialogs } from "./requests-page-dialogs"

import type {
  ApiRequestActionResponse,
  ApiRequestScope,
  ApiRequestStatus,
} from "@/features/requests/types/request-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import {
  ManagementPermissionKeys,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  approveRequest,
  denyRequest,
  requestDetailQueryOptions,
  requestsQueryOptions,
} from "@/features/requests/api/requests-api"
import { getRequestColumns } from "@/features/requests/components/requests-columns"
import { formatRequestStatus } from "@/features/requests/utils/request-presenters"
import { formatToastError } from "@/features/shared/utils/format"

const requestsRouteApi = getRouteApi("/_dashboard/manager/requests")

export function RequestsPage() {
  const { user } = requestsRouteApi.useRouteContext()
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

  const { data: tree, isLoading: isTreeLoading } = useQuery(
    inventoryTreeQueryOptions
  )
  const {
    data: pendingRequests,
    error: pendingError,
    isLoading: isPendingLoading,
  } = useQuery(requestsQueryOptions("pending"))
  const {
    data: completedRequests,
    error: completedError,
    isLoading: isCompletedLoading,
  } = useQuery(requestsQueryOptions("completed"))
  const {
    data: requestDetail,
    error: requestDetailError,
    isLoading: isRequestDetailLoading,
  } = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })

  const activeRequests =
    (scope === "pending" ? pendingRequests : completedRequests) ?? []
  const activeError = scope === "pending" ? pendingError : completedError
  const isActiveLoading =
    scope === "pending" ? isPendingLoading : isCompletedLoading
  const isRequestsLoading =
    isTreeLoading || isPendingLoading || isCompletedLoading
  const pendingCount = pendingRequests?.length ?? 0
  const completedCount = completedRequests?.length ?? 0
  const statusCounts = useMemo(() => {
    const counts: Record<ApiRequestStatus, number> = {
      pending: 0,
      approved: 0,
      denied: 0,
      executed: 0,
      execution_failed: 0,
    }

    pendingRequests?.forEach((r) => {
      counts[r.status]++
    })
    completedRequests?.forEach((r) => {
      counts[r.status]++
    })

    return counts
  }, [pendingRequests, completedRequests])

  const chartData = useMemo(() => {
    const statusClasses: Record<ApiRequestStatus, string> = {
      pending: "fill-amber-600/75 dark:fill-amber-400/75",
      approved: "fill-purple-600/75 dark:fill-purple-400/75",
      denied: "fill-red-600/75 dark:fill-red-400/75",
      executed: "fill-emerald-600/75 dark:fill-emerald-400/75",
      execution_failed: "fill-orange-600/75 dark:fill-orange-400/75",
    }

    return Object.entries(statusCounts).flatMap(([status, value]) =>
      value > 0
        ? [
            {
              label: formatRequestStatus(status as ApiRequestStatus),
              value,
              className: statusClasses[status as ApiRequestStatus],
            },
          ]
        : []
    )
  }, [statusCounts])

  const openRequest = (requestId: string) => setSelectedRequestId(requestId)
  const handleRequestDetailOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedRequestId(null)
    }
  }, [])

  const columns = useMemo(
    () =>
      getRequestColumns({
        onOpen: (request) => openRequest(request.id),
        tree,
      }),
    [tree]
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
  const handleApproveRequest = useCallback(() => {
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
  }, [approveMutation, selectedRequestId])
  const handleDenyRequest = useCallback(() => {
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
  }, [denyMutation, selectedRequestId])

  if (isRequestsLoading) {
    return <RequestsPageSkeleton />
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <RequestsPageOverviewCard
          statusCounts={statusCounts}
          chartData={chartData}
        />

        <RequestsPageQueueCard
          scope={scope}
          onScopeChange={setScope}
          pendingCount={pendingCount}
          completedCount={completedCount}
          columns={columns}
          activeRequests={activeRequests}
          isActiveLoading={isActiveLoading}
          activeError={activeError}
          canReview={canReview}
          tree={tree}
          approveMutation={approveMutation}
          denyMutation={denyMutation}
          onOpenConfirm={setConfirm}
        />
      </div>

      <RequestsPageDialogs
        selectedRequestId={selectedRequestId}
        canReview={canReview}
        requestDetailError={requestDetailError}
        isRequestDetailLoading={isRequestDetailLoading}
        onApprove={handleApproveRequest}
        onDeny={handleDenyRequest}
        onRequestDetailOpenChange={handleRequestDetailOpenChange}
        requestDetail={requestDetail}
        tree={tree}
        confirm={confirm}
        onConfirmClose={() => setConfirm(null)}
      />
    </div>
  )
}
