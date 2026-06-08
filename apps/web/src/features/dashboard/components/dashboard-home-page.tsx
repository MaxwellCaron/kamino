import { Suspense, lazy, useMemo, useState } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import {
  IconClock,
  IconCopy,
  IconDeviceDesktop,
  IconPlayerPlay,
} from "@tabler/icons-react"
import {
  countAccessibleInventory,
  getRequestSortTime,
  indexInventoryTree,
} from "../utils/dashboard-utils"
import {
  buildQuestionActivityData,
  countVmStatusSummary,
  toTime,
} from "../utils/dashboard-home-utils"
import { DashboardActivityTableCard } from "./dashboard-activity-table-card"
import { getDashboardActivityColumns } from "./dashboard-activity-columns"
import { DashboardCurrentClonedPodCard } from "./dashboard-current-cloned-pod-card"
import { DashboardFavoritesCard } from "./dashboard-favorites-card"
import { DashboardHomeSkeleton } from "./dashboard-home-skeleton"
import { DashboardProfileCard } from "./dashboard-profile-card"
import { DashboardQuestionActivityCard } from "./dashboard-question-activity-card"
import { DashboardRecentPodsCard } from "./dashboard-recent-pods-card"
import { DashboardStatsGrid } from "./dashboard-stats-grid"
import type { ClonedPodEntry } from "./dashboard-home-types"
import type { AuthUser } from "@/features/auth/types/auth-types"
import { getManagementRoleLabel } from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { useInventoryFavorites } from "@/features/inventory/hooks/use-inventory-favorites"
import { clonedPodQueryOptions } from "@/features/pods/api/clone-pod-api"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"
import {
  requestDetailQueryOptions,
  requesterRequestsQueryOptions,
} from "@/features/requests/api/requests-api"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"

const ChangePasswordDialog = lazy(() =>
  import("./change-password-dialog").then((module) => ({
    default: module.ChangePasswordDialog,
  }))
)
const RequestDetailDialog = lazy(() =>
  import("@/features/requests/components/request-detail-dialog").then(
    (module) => ({
      default: module.RequestDetailDialog,
    })
  )
)

export function DashboardHomePage({ user }: { user: AuthUser }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )

  const treeQuery = useQuery(inventoryTreeQueryOptions)
  const pendingRequestsQuery = useQuery(
    requesterRequestsQueryOptions("pending")
  )
  const historyRequestsQuery = useQuery(
    requesterRequestsQueryOptions("history")
  )
  const catalogQuery = useQuery(podCatalogQueryOptions)
  const detailQuery = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })
  const { favoriteIds } = useInventoryFavorites()
  const vmStatusQuery = useQuery(vmStatusQueryOptions)
  const visiblePods = catalogQuery.data ?? []
  const cloneQueries = useQueries({
    queries: visiblePods.map((pod) => clonedPodQueryOptions(pod.slug)),
  })

  const inventoryStats = useMemo(
    () => countAccessibleInventory(treeQuery.data ?? []),
    [treeQuery.data]
  )

  const inventoryItemsById = useMemo(
    () => indexInventoryTree(treeQuery.data ?? []),
    [treeQuery.data]
  )

  const vmStatusSummary = useMemo(
    () => countVmStatusSummary(inventoryItemsById, vmStatusQuery.data),
    [inventoryItemsById, vmStatusQuery.data]
  )

  const favorites = useMemo(
    () =>
      Array.from(favoriteIds)
        .map((itemId) => inventoryItemsById.get(itemId))
        .filter(
          (item): item is NonNullable<typeof item> =>
            !!item && item.kind === "vm"
        ),
    [favoriteIds, inventoryItemsById]
  )

  const requests = useMemo(
    () =>
      [
        ...(pendingRequestsQuery.data ?? []),
        ...(historyRequestsQuery.data ?? []),
      ].sort(
        (left, right) => getRequestSortTime(right) - getRequestSortTime(left)
      ),
    [historyRequestsQuery.data, pendingRequestsQuery.data]
  )

  const recentPods = useMemo(
    () =>
      [...visiblePods]
        .sort(
          (left, right) => toTime(right.created_at) - toTime(left.created_at)
        )
        .slice(0, 3),
    [visiblePods]
  )
  const clonedPodEntries = cloneQueries.flatMap<ClonedPodEntry>(
    (query, index) => {
      const clonedPod = query.data
      const pod = visiblePods[index]

      return clonedPod ? [{ clonedPod, pod }] : []
    }
  )
  const currentClonedPod =
    [...clonedPodEntries].sort(
      (left, right) =>
        toTime(right.clonedPod.cloned_at) - toTime(left.clonedPod.cloned_at)
    )[0] ?? null
  const questionActivityData = useMemo(
    () => buildQuestionActivityData(clonedPodEntries),
    [clonedPodEntries]
  )
  const cloneStatusLoading = cloneQueries.some((query) => query.isLoading)
  const cloneStatusError =
    cloneQueries.find((query) => query.error)?.error ?? null

  const activityColumns = useMemo(
    () =>
      getDashboardActivityColumns({
        onOpen: (request) => setSelectedRequestId(request.id),
        tree: treeQuery.data,
      }),
    [treeQuery.data]
  )

  const activityError = pendingRequestsQuery.error ?? historyRequestsQuery.error

  const activityLoading =
    pendingRequestsQuery.isLoading || historyRequestsQuery.isLoading
  const isDashboardLoading =
    treeQuery.isLoading || activityLoading || catalogQuery.isLoading

  const stats = [
    {
      icon: IconDeviceDesktop,
      label: "Virtual Machines",
      value: String(inventoryStats.vms),
    },
    {
      icon: IconPlayerPlay,
      label: "Running VMs",
      value: vmStatusQuery.isLoading ? "—" : String(vmStatusSummary.running),
    },
    {
      icon: IconCopy,
      label: "Cloned Pods",
      value: String(clonedPodEntries.length),
    },
    {
      icon: IconClock,
      label: "Pending Requests",
      value: String(pendingRequestsQuery.data?.length ?? 0),
    },
  ]
  const roleLabel = getManagementRoleLabel(user.management_permissions)

  if (isDashboardLoading) {
    return <DashboardHomeSkeleton />
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="grid grid-cols-1 gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6 xl:grid-cols-12">
        <DashboardStatsGrid className="xl:col-span-7" stats={stats} />
        <DashboardProfileCard
          className="xl:col-span-5"
          roleLabel={roleLabel}
          user={user}
          onSettingsClick={() => setSettingsOpen(true)}
        />
        <DashboardQuestionActivityCard
          className="xl:col-span-4"
          data={questionActivityData}
          error={cloneStatusError}
          isLoading={cloneStatusLoading}
        />
        <DashboardCurrentClonedPodCard
          className="xl:col-span-8"
          entry={currentClonedPod}
          error={cloneStatusError}
          isLoading={cloneStatusLoading}
        />
        <DashboardRecentPodsCard
          className="xl:col-span-12"
          error={catalogQuery.error}
          pods={recentPods}
          totalPods={visiblePods.length}
        />
        <DashboardActivityTableCard
          className="xl:col-span-9"
          columns={activityColumns}
          data={requests}
          error={activityError}
          isLoading={activityLoading}
        />
        <DashboardFavoritesCard
          className="xl:col-span-3"
          favorites={favorites}
          vmStatuses={vmStatusQuery.data}
        />
      </div>

      <Suspense fallback={null}>
        {settingsOpen && (
          <ChangePasswordDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />
        )}
        {selectedRequestId !== null && (
          <RequestDetailDialog
            canReview={false}
            error={detailQuery.error}
            isLoading={detailQuery.isLoading}
            onApprove={() => {}}
            onDeny={() => {}}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedRequestId(null)
              }
            }}
            open={true}
            request={detailQuery.data ?? null}
            tree={treeQuery.data}
          />
        )}
      </Suspense>
    </div>
  )
}
