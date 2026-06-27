import { Suspense, lazy, useCallback, useMemo, useState } from "react"
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { UserGroupIcon, UserIcon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import {
  buildStorageByNode,
  countInventoryStats,
  formatMutationError,
  getRecentPrincipals,
  getRecentRequests,
} from "../utils/admin-dashboard"
import { AdminClusterCard } from "./admin-cluster-card"
import { AdminDashboardHeader } from "./admin-dashboard-header"
import { getPrincipalColumns } from "./admin-principal-columns"
import { AdminDashboardActionButtons } from "./admin-dashboard-action-buttons"
import { AdminDashboardSkeleton } from "./admin-dashboard-skeleton"
import { AdminDashboardPendingRequestsCard } from "./admin-dashboard-pending-requests-card"
import { AdminDashboardPrincipalsCards } from "./admin-dashboard-principals-cards"
import type { AdminStats } from "../utils/admin-dashboard"
import type { AuthUser } from "@/features/auth/types/auth-types"
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
  requestSummariesQueryOptions,
} from "@/features/requests/api/requests-api"
import { getRequestColumns } from "@/features/requests/components/requests-columns"
import {
  nodesQueryOptions,
  storagesQueryOptions,
} from "@/features/vms/api/proxmox-options-api"

const RequestDetailDialog = lazy(() =>
  import("@/features/requests/components/request-detail-dialog").then(
    (module) => ({
      default: module.RequestDetailDialog,
    })
  )
)

export function AdminDashboardPage({ user }: { user: AuthUser }) {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )
  const queryClient = useQueryClient()
  const {
    data: users,
    error: usersError,
    isLoading: isUsersLoading,
  } = useQuery(usersQueryOptions)
  const {
    data: groups,
    error: groupsError,
    isLoading: isGroupsLoading,
  } = useQuery(groupsQueryOptions)
  const { data: inventoryTree, isLoading: isInventoryLoading } = useQuery(
    inventoryTreeQueryOptions
  )
  const {
    data: pendingRequestsData,
    error: pendingRequestsError,
    isLoading: isPendingRequestsLoading,
  } = useQuery(requestSummariesQueryOptions("pending"))
  const { data: completedRequestsData, isLoading: isCompletedRequestsLoading } =
    useQuery(requestSummariesQueryOptions("completed"))
  const { data: nodesData } = useQuery(nodesQueryOptions)
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

  const storageQueries = useQueries({
    queries: (nodesData ?? []).map((node) => storagesQueryOptions(node.node)),
  })

  const requestColumns = useMemo(
    () =>
      getRequestColumns({
        onOpen: (request) => setSelectedRequestId(request.id),
        selectable: false,
        tree: inventoryTree,
        excludeColumns: ["status", "reviewer_username", "updated_at"],
      }),
    [inventoryTree]
  )
  const userColumns = useMemo(
    () => getPrincipalColumns({ icon: UserIcon, label: "User" }),
    []
  )
  const groupColumns = useMemo(
    () => getPrincipalColumns({ icon: UserGroupIcon, label: "Group" }),
    []
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

  const pendingRequests = useMemo(
    () => getRecentRequests(pendingRequestsData ?? []),
    [pendingRequestsData]
  )

  const recentUsers = useMemo(() => getRecentPrincipals(users ?? []), [users])

  const recentGroups = useMemo(
    () => getRecentPrincipals(groups ?? []),
    [groups]
  )

  const adminStats = useMemo<AdminStats | null>(() => {
    if (
      !users ||
      !groups ||
      !inventoryTree ||
      !pendingRequestsData ||
      !completedRequestsData
    ) {
      return null
    }
    const { folders, vms, templates } = countInventoryStats(inventoryTree)
    return {
      users: users.length,
      groups: groups.length,
      folders,
      vms,
      templates,
      requests: pendingRequestsData.length + completedRequestsData.length,
    }
  }, [users, groups, inventoryTree, pendingRequestsData, completedRequestsData])

  const storageByNode = useMemo(() => {
    return buildStorageByNode(
      nodesData ?? [],
      storageQueries.map((query) => query.data)
    )
  }, [nodesData, storageQueries])
  const handleRequestDetailOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedRequestId(null)
    }
  }, [])
  const handleApproveRequest = useCallback(() => {
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
  }, [approveMutation, selectedRequestId])
  const handleDenyRequest = useCallback(() => {
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
  }, [denyMutation, selectedRequestId])

  const nodes = nodesData ?? []
  const isDashboardLoading =
    isUsersLoading ||
    isGroupsLoading ||
    isInventoryLoading ||
    isPendingRequestsLoading ||
    isCompletedRequestsLoading

  if (isDashboardLoading) {
    return <AdminDashboardSkeleton />
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6 xl:grid xl:grid-cols-12">
        <div className="xl:col-span-12">
          <AdminDashboardHeader stats={adminStats} />
        </div>

        <AdminDashboardPendingRequestsCard
          columns={requestColumns}
          data={pendingRequests}
          error={pendingRequestsError}
          isLoading={isPendingRequestsLoading}
        />

        <div className="xl:col-span-5">
          <AdminDashboardActionButtons />
        </div>

        <AdminClusterCard nodes={nodes} storageByNode={storageByNode} />

        <AdminDashboardPrincipalsCards
          groupColumns={groupColumns}
          recentGroups={recentGroups}
          groupsError={groupsError}
          isGroupsLoading={isGroupsLoading}
          userColumns={userColumns}
          recentUsers={recentUsers}
          usersError={usersError}
          isUsersLoading={isUsersLoading}
        />
      </div>

      <Suspense fallback={null}>
        {selectedRequestId !== null && (
          <RequestDetailDialog
            canReview={canReview}
            error={requestDetailError}
            isLoading={isRequestDetailLoading}
            onApprove={handleApproveRequest}
            onDeny={handleDenyRequest}
            onOpenChange={handleRequestDetailOpenChange}
            open={true}
            request={requestDetail ?? null}
            tree={inventoryTree}
          />
        )}
      </Suspense>
    </div>
  )
}
