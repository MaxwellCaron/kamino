import { useMemo } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { UserGroupIcon, UserIcon } from "@hugeicons/core-free-icons"
import {
  buildStorageSummary,
  countInventoryStats,
  getRecentPrincipals,
  getRecentRequests,
} from "../utils/admin-dashboard"
import { getPrincipalColumns } from "../components/admin-principal-columns"
import type {
  AdminStats,
  DashboardStorageSummary,
} from "../utils/admin-dashboard"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import {
  requestSummariesQueryOptions,
  requestSummaryCountQueryOptions,
} from "@/features/requests/api/requests-api"
import { getRequestColumns } from "@/features/requests/components/requests-columns"
import {
  nodesQueryOptions,
  storagesQueryOptions,
} from "@/features/vms/api/proxmox-options-api"

const EMPTY_STORAGE_SUMMARY: DashboardStorageSummary = {
  localByNode: new Map(),
  shared: [],
  localTotal: { total: 0, used: 0 },
  sharedTotal: { total: 0, used: 0 },
  clusterTotal: { total: 0, used: 0 },
}

export function useAdminDashboardData(
  onOpenRequest: (requestId: string) => void
) {
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
  const {
    data: inventoryTree,
    error: inventoryError,
    isLoading: isInventoryLoading,
  } = useQuery(inventoryTreeQueryOptions)
  const {
    data: pendingRequestsData,
    error: pendingRequestsError,
    isLoading: isPendingRequestsLoading,
  } = useQuery(requestSummariesQueryOptions("pending"))
  const {
    data: pendingRequestsTotal,
    error: pendingRequestsTotalError,
    isLoading: isPendingRequestsTotalLoading,
  } = useQuery(requestSummaryCountQueryOptions("pending"))
  const {
    data: completedRequestsTotal,
    error: completedRequestsTotalError,
    isLoading: isCompletedRequestsTotalLoading,
  } = useQuery(requestSummaryCountQueryOptions("completed"))
  const {
    data: nodesData,
    error: nodesError,
    isLoading: isNodesLoading,
  } = useQuery(nodesQueryOptions)

  const storageQueries = useQueries({
    queries: (nodesData ?? []).map((node) => storagesQueryOptions(node.node)),
  })

  const requestColumns = useMemo(
    () =>
      getRequestColumns({
        onOpen: (request) => onOpenRequest(request.id),
        selectable: false,
        tree: inventoryTree,
        excludeColumns: ["status", "reviewer_username", "updated_at"],
      }),
    [inventoryTree, onOpenRequest]
  )
  const userColumns = useMemo(
    () => getPrincipalColumns({ icon: UserIcon, label: "User" }),
    []
  )
  const groupColumns = useMemo(
    () => getPrincipalColumns({ icon: UserGroupIcon, label: "Group" }),
    []
  )

  const pendingRequests = useMemo(
    () =>
      pendingRequestsError || !pendingRequestsData
        ? []
        : getRecentRequests(pendingRequestsData),
    [pendingRequestsData, pendingRequestsError]
  )
  const recentUsers = useMemo(
    () => (usersError || !users ? [] : getRecentPrincipals(users)),
    [users, usersError]
  )
  const recentGroups = useMemo(
    () => (groupsError || !groups ? [] : getRecentPrincipals(groups)),
    [groups, groupsError]
  )

  const adminStats = useMemo<AdminStats | null>(() => {
    if (
      usersError ||
      groupsError ||
      inventoryError ||
      pendingRequestsTotalError ||
      completedRequestsTotalError ||
      !users ||
      !groups ||
      !inventoryTree ||
      pendingRequestsTotal === undefined ||
      completedRequestsTotal === undefined
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
      requests: pendingRequestsTotal + completedRequestsTotal,
    }
  }, [
    users,
    groups,
    inventoryTree,
    pendingRequestsTotal,
    completedRequestsTotal,
    usersError,
    groupsError,
    inventoryError,
    pendingRequestsTotalError,
    completedRequestsTotalError,
  ])

  const storageSummary = useMemo(() => {
    if (nodesError || !nodesData) {
      return null
    }
    return buildStorageSummary(
      nodesData,
      storageQueries.map((query) => query.data)
    )
  }, [nodesData, nodesError, storageQueries])
  const storageError = useMemo(
    () => storageQueries.find((query) => query.error)?.error,
    [storageQueries]
  )
  const isClusterCapacityLoading =
    isNodesLoading ||
    (nodesData !== undefined &&
      nodesData.length > 0 &&
      storageQueries.some((query) => query.isLoading))

  const nodes = nodesData ?? []
  const primaryStatsError =
    inventoryError ?? pendingRequestsTotalError ?? completedRequestsTotalError
  const isMainDashboardLoading =
    isUsersLoading ||
    isGroupsLoading ||
    isInventoryLoading ||
    isPendingRequestsLoading ||
    isPendingRequestsTotalLoading ||
    isCompletedRequestsTotalLoading ||
    isClusterCapacityLoading
  const isDashboardEmpty =
    !isMainDashboardLoading &&
    !primaryStatsError &&
    !nodesError &&
    adminStats !== null &&
    Object.values(adminStats).every((value) => value === 0) &&
    nodes.length === 0

  return {
    cluster: {
      isCapacityLoading: isClusterCapacityLoading,
      nodes,
      nodesError,
      storageError,
      storageSummary: storageSummary ?? EMPTY_STORAGE_SUMMARY,
    },
    header: { stats: adminStats },
    inventoryTree,
    pendingRequests: {
      columns: requestColumns,
      data: pendingRequests,
      error: pendingRequestsError,
      isLoading: isPendingRequestsLoading,
    },
    principals: {
      groupColumns,
      recentGroups,
      groupsError,
      isGroupsLoading,
      userColumns,
      recentUsers,
      usersError,
      isUsersLoading,
    },
    state: {
      error: primaryStatsError,
      isEmpty: isDashboardEmpty,
      isLoading: isMainDashboardLoading,
    },
  }
}
