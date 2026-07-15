import { useCallback, useMemo, useReducer } from "react"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { getRouteApi } from "@tanstack/react-router"

import { RequestsPageOverviewCard } from "./requests-page-overview-card"
import { RequestsPageQueueCard } from "./requests-page-queue-card"
import { RequestsPageDialogs } from "./requests-page-dialogs"

import type {
  ApiRequestScope,
  ApiRequestStatus,
} from "@/features/requests/types/request-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { OnChangeFn, PaginationState } from "@tanstack/react-table"
import { PreloadOverlay } from "@/components/loading-overlay"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import {
  ManagementPermissionKeys,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  approveRequest,
  denyRequest,
  managerRequestStatusCountsQueryOptions,
  requestDetailQueryOptions,
  requestsTableQueryOptions,
} from "@/features/requests/api/requests-api"
import { getRequestColumns } from "@/features/requests/components/requests-columns"
import { formatRequestStatus } from "@/features/requests/utils/request-presenters"

const requestsRouteApi = getRouteApi("/_dashboard/manager/requests")

type RequestsTableState = {
  pagination: PaginationState
  search: string
}

type RequestsPageState = {
  scope: ApiRequestScope
  selectedRequestId: string | null
  confirm: ConfirmConfig | null
  pendingTableState: RequestsTableState
  completedTableState: RequestsTableState
}

type RequestsPageAction =
  | { type: "setScope"; scope: ApiRequestScope }
  | { type: "setSelectedRequestId"; requestId: string | null }
  | { type: "setConfirm"; confirm: ConfirmConfig | null }
  | {
      type: "setPendingPagination"
      updater: PaginationState | ((old: PaginationState) => PaginationState)
    }
  | { type: "setPendingSearch"; search: string }
  | {
      type: "setCompletedPagination"
      updater: PaginationState | ((old: PaginationState) => PaginationState)
    }
  | { type: "setCompletedSearch"; search: string }

const DEFAULT_TABLE_STATE = (): RequestsTableState => ({
  pagination: { pageIndex: 0, pageSize: 25 },
  search: "",
})

const INITIAL_STATE: RequestsPageState = {
  scope: "pending",
  selectedRequestId: null,
  confirm: null,
  pendingTableState: DEFAULT_TABLE_STATE(),
  completedTableState: DEFAULT_TABLE_STATE(),
}

function requestsPageReducer(
  state: RequestsPageState,
  action: RequestsPageAction
): RequestsPageState {
  switch (action.type) {
    case "setScope":
      return { ...state, scope: action.scope }
    case "setSelectedRequestId":
      return { ...state, selectedRequestId: action.requestId }
    case "setConfirm":
      return { ...state, confirm: action.confirm }
    case "setPendingPagination":
      return {
        ...state,
        pendingTableState: {
          ...state.pendingTableState,
          pagination:
            typeof action.updater === "function"
              ? action.updater(state.pendingTableState.pagination)
              : action.updater,
        },
      }
    case "setPendingSearch":
      return {
        ...state,
        pendingTableState: {
          ...state.pendingTableState,
          search: action.search,
        },
      }
    case "setCompletedPagination":
      return {
        ...state,
        completedTableState: {
          ...state.completedTableState,
          pagination:
            typeof action.updater === "function"
              ? action.updater(state.completedTableState.pagination)
              : action.updater,
        },
      }
    case "setCompletedSearch":
      return {
        ...state,
        completedTableState: {
          ...state.completedTableState,
          search: action.search,
        },
      }
    default:
      return state
  }
}

export function RequestsPage() {
  const { user } = requestsRouteApi.useRouteContext()
  const [state, dispatch] = useReducer(requestsPageReducer, INITIAL_STATE)
  const {
    scope,
    selectedRequestId,
    confirm,
    pendingTableState,
    completedTableState,
  } = state
  const queryClient = useQueryClient()
  const canReview = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.manager
  )

  const { data: tree, isLoading: isTreeLoading } = useQuery(
    inventoryTreeQueryOptions
  )

  const { data: statusCountsData } = useQuery(
    managerRequestStatusCountsQueryOptions()
  )

  const {
    data: pendingPage,
    error: pendingError,
    isLoading: isPendingLoading,
  } = useQuery({
    ...requestsTableQueryOptions("pending", {
      pageIndex: pendingTableState.pagination.pageIndex,
      pageSize: pendingTableState.pagination.pageSize,
      search: pendingTableState.search,
    }),
    placeholderData: keepPreviousData,
  })

  const {
    data: completedPage,
    error: completedError,
    isLoading: isCompletedLoading,
  } = useQuery({
    ...requestsTableQueryOptions("completed", {
      pageIndex: completedTableState.pagination.pageIndex,
      pageSize: completedTableState.pagination.pageSize,
      search: completedTableState.search,
    }),
    placeholderData: keepPreviousData,
    enabled: scope === "completed",
  })

  const {
    data: requestDetail,
    error: requestDetailError,
    isLoading: isRequestDetailLoading,
  } = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })

  const activeRequests =
    (scope === "pending" ? pendingPage?.items : completedPage?.items) ?? []
  const activeError = scope === "pending" ? pendingError : completedError
  const isActiveLoading =
    scope === "pending" ? isPendingLoading : isCompletedLoading
  const isRequestsLoading = isTreeLoading || isPendingLoading
  const pendingCount = pendingPage?.total ?? 0
  const completedCount = isCompletedLoading ? null : (completedPage?.total ?? 0)
  const statusCounts = useMemo((): Record<ApiRequestStatus, number> => {
    return {
      pending: statusCountsData?.pending ?? 0,
      approved: statusCountsData?.approved ?? 0,
      denied: statusCountsData?.denied ?? 0,
      executed: statusCountsData?.executed ?? 0,
      execution_failed: statusCountsData?.execution_failed ?? 0,
    }
  }, [statusCountsData])

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

  const openRequest = useCallback((requestId: string) => {
    dispatch({ type: "setSelectedRequestId", requestId })
  }, [])
  const handleRequestDetailOpenChange = useCallback((open: boolean) => {
    if (!open) {
      dispatch({ type: "setSelectedRequestId", requestId: null })
    }
  }, [])

  const columns = useMemo(
    () =>
      getRequestColumns({
        onOpen: (request) => openRequest(request.id),
        tree,
      }),
    [openRequest, tree]
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
    dispatch({ type: "setSelectedRequestId", requestId: null })
    showSingleMutationToast({
      title: "Approving request",
      name: "Request",
      promise: approveMutation.mutateAsync([id]).then((result) => {
        if (result.failed.length > 0) {
          throw new Error(result.failed[0].error)
        }
        return result
      }),
      successDescription: "Approved",
    })
  }, [approveMutation, selectedRequestId])
  const handleDenyRequest = useCallback(() => {
    if (!selectedRequestId) {
      return
    }
    const id = selectedRequestId
    dispatch({ type: "setSelectedRequestId", requestId: null })
    showSingleMutationToast({
      title: "Denying request",
      name: "Request",
      promise: denyMutation.mutateAsync([id]).then((result) => {
        if (result.failed.length > 0) {
          throw new Error(result.failed[0].error)
        }
        return result
      }),
      successDescription: "Denied",
    })
  }, [denyMutation, selectedRequestId])

  const handleScopeChange = useCallback((nextScope: ApiRequestScope) => {
    dispatch({ type: "setScope", scope: nextScope })
  }, [])

  const setPendingPagination = useCallback<OnChangeFn<PaginationState>>(
    (updater) => {
      dispatch({ type: "setPendingPagination", updater })
    },
    []
  )
  const setPendingSearch = useCallback((value: string) => {
    dispatch({ type: "setPendingSearch", search: value })
  }, [])
  const setCompletedPagination = useCallback<OnChangeFn<PaginationState>>(
    (updater) => {
      dispatch({ type: "setCompletedPagination", updater })
    },
    []
  )
  const setCompletedSearch = useCallback((value: string) => {
    dispatch({ type: "setCompletedSearch", search: value })
  }, [])
  const handleOpenConfirm = useCallback((nextConfirm: ConfirmConfig) => {
    dispatch({ type: "setConfirm", confirm: nextConfirm })
  }, [])
  const handleConfirmClose = useCallback(() => {
    dispatch({ type: "setConfirm", confirm: null })
  }, [])

  return (
    <div className="@container/main relative flex flex-1 flex-col gap-2">
      <PreloadOverlay active={isRequestsLoading} label="Loading requests" />
      {!isRequestsLoading && (
        <>
          <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <RequestsPageOverviewCard
          statusCounts={statusCounts}
          chartData={chartData}
        />

        <RequestsPageQueueCard
          scope={scope}
          onScopeChange={handleScopeChange}
          pendingCount={pendingCount}
          completedCount={completedCount}
          columns={columns}
          activeRequests={activeRequests}
          isActiveLoading={isActiveLoading}
          activeError={activeError}
          canReview={canReview}
          approveMutation={approveMutation}
          denyMutation={denyMutation}
          onOpenConfirm={handleOpenConfirm}
          serverPagination={
            scope === "pending"
              ? {
                  mode: "server",
                  pagination: pendingTableState.pagination,
                  onPaginationChange: setPendingPagination,
                  rowCount: pendingPage?.total ?? 0,
                  search: pendingTableState.search,
                  onSearchChange: setPendingSearch,
                }
              : {
                  mode: "server",
                  pagination: completedTableState.pagination,
                  onPaginationChange: setCompletedPagination,
                  rowCount: completedPage?.total ?? 0,
                  search: completedTableState.search,
                  onSearchChange: setCompletedSearch,
                }
          }
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
        onConfirmClose={handleConfirmClose}
      />
        </>
      )}
    </div>
  )
}
