import { useCallback, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { AdminClusterCard } from "./admin-cluster-card"
import { AdminDashboardHeader } from "./admin-dashboard-header"
import { AdminDashboardActionButtons } from "./admin-dashboard-action-buttons"
import { AdminDashboardPendingRequestsCard } from "./admin-dashboard-pending-requests-card"
import { AdminDashboardPrincipalsCards } from "./admin-dashboard-principals-cards"
import type { AuthUser } from "@/features/auth/types/auth-types"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { useAdminDashboardData } from "@/features/admin/hooks/use-admin-dashboard-data"
import {
  ManagementPermissionKeys,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import {
  approveRequest,
  denyRequest,
  requestDetailQueryOptions,
} from "@/features/requests/api/requests-api"
import { RequestDetailDialog } from "@/features/requests/components/request-detail-dialog"

export function AdminDashboardPage({ user }: { user: AuthUser }) {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )
  const queryClient = useQueryClient()
  const handleOpenRequest = useCallback((requestId: string) => {
    setSelectedRequestId(requestId)
  }, [])
  const dashboard = useAdminDashboardData(handleOpenRequest)
  const {
    data: requestDetail,
    error: requestDetailError,
    isLoading: isRequestDetailLoading,
  } = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })
  const canReview = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.manager
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

  const handleRequestDetailOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedRequestId(null)
    }
  }, [])
  const handleApproveRequest = useCallback(() => {
    if (
      !selectedRequestId ||
      approveMutation.isPending ||
      denyMutation.isPending
    ) {
      return
    }
    const id = selectedRequestId
    showSingleMutationToast({
      title: "Approving request",
      name: "Request",
      promise: approveMutation.mutateAsync([id]).then((result) => {
        if (result.failed.length > 0) {
          throw new Error(result.failed[0].error)
        }
        setSelectedRequestId(null)
        return result
      }),
      successDescription: "Approved",
    })
  }, [approveMutation, denyMutation.isPending, selectedRequestId])
  const handleDenyRequest = useCallback(() => {
    if (
      !selectedRequestId ||
      approveMutation.isPending ||
      denyMutation.isPending
    ) {
      return
    }
    const id = selectedRequestId
    showSingleMutationToast({
      title: "Denying request",
      name: "Request",
      promise: denyMutation.mutateAsync([id]).then((result) => {
        if (result.failed.length > 0) {
          throw new Error(result.failed[0].error)
        }
        setSelectedRequestId(null)
        return result
      }),
      successDescription: "Denied",
    })
  }, [approveMutation.isPending, denyMutation, selectedRequestId])

  const isPending = approveMutation.isPending || denyMutation.isPending

  return (
    <div className="@container/main relative flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6 xl:grid xl:grid-cols-12">
        {dashboard.state.error ? (
          <div className="xl:col-span-12">
            <InlineErrorAlert
              error={dashboard.state.error}
              fallback="Failed to load admin dashboard statistics."
              title="Statistics unavailable"
            />
          </div>
        ) : null}

        {dashboard.state.isEmpty ? (
          <Empty className="min-h-48 border xl:col-span-12">
            <EmptyHeader>
              <EmptyTitle>No managed resources yet</EmptyTitle>
              <EmptyDescription>
                Use the administrative actions below to start configuring
                Kamino.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        <div className="xl:col-span-12">
          <AdminDashboardHeader {...dashboard.header} />
        </div>

        <AdminDashboardPendingRequestsCard {...dashboard.pendingRequests} />

        <div className="xl:col-span-5">
          <AdminDashboardActionButtons />
        </div>

        <AdminClusterCard {...dashboard.cluster} />

        <AdminDashboardPrincipalsCards {...dashboard.principals} />
      </div>

      <>
        {isPending ? (
          <span className="sr-only" role="status" aria-live="polite">
            Updating request...
          </span>
        ) : null}
        {selectedRequestId !== null && (
          <RequestDetailDialog
            approvePending={approveMutation.isPending}
            canReview={canReview}
            denyPending={denyMutation.isPending}
            disabled={isPending}
            error={requestDetailError}
            isLoading={isRequestDetailLoading}
            onApprove={handleApproveRequest}
            onDeny={handleDenyRequest}
            onOpenChange={handleRequestDetailOpenChange}
            open={true}
            request={requestDetail ?? null}
            tree={dashboard.inventoryTree}
          />
        )}
      </>
    </div>
  )
}
