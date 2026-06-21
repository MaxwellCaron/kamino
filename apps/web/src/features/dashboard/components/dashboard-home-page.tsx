import { Suspense, lazy, useMemo, useState } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import {
  IconClock,
  IconCopy,
  IconDeviceDesktop,
  IconPlayerPlay,
} from "@tabler/icons-react"
import { DashboardActivityTableCard } from "./dashboard-requests-card"
import { getDashboardActivityColumns } from "./dashboard-requests-columns"
import { DashboardCurrentClonedPodCard } from "./dashboard-cloned-pod-card"
import { DashboardFavoritesCard } from "./dashboard-favorites-card"
import { DashboardHomeSkeleton } from "./dashboard-home-skeleton"
import { DashboardProfileCard } from "./dashboard-profile-card"
import { DashboardQuestionActivityCard } from "./dashboard-question-activity-card"
import { DashboardRecentPodsCard } from "./dashboard-published-pods-card"
import { DashboardStatsGrid } from "./dashboard-stat-cards"
import type { ClonedPodEntry } from "../utils/dashboard-types"
import type { HeatmapColumn } from "@workspace/ui/components/charts/heatmap"
import type { AuthUser } from "@/features/auth/types/auth-types"
import type { PodQuestionActivityAnswer } from "@/features/pods/types/pod-types"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import { getManagementRoleLabel } from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { useInventoryFavorites } from "@/features/inventory/hooks/use-inventory-favorites"
import {
  clonedPodQueryOptions,
  podQuestionActivityQueryOptions,
} from "@/features/pods/api/clone-pod-api"
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

  const { data: tree, isLoading: isTreeLoading } = useQuery(
    inventoryTreeQueryOptions
  )
  const {
    data: pendingRequests,
    error: pendingRequestsError,
    isLoading: isPendingRequestsLoading,
  } = useQuery(requesterRequestsQueryOptions("pending"))
  const {
    data: historyRequests,
    error: historyRequestsError,
    isLoading: isHistoryRequestsLoading,
  } = useQuery(requesterRequestsQueryOptions("history"))
  const {
    data: catalog,
    error: catalogError,
    isLoading: isCatalogLoading,
  } = useQuery(podCatalogQueryOptions)
  const {
    data: questionActivity,
    error: questionActivityError,
    isLoading: isQuestionActivityLoading,
  } = useQuery(podQuestionActivityQueryOptions())
  const {
    data: requestDetail,
    error: requestDetailError,
    isLoading: isRequestDetailLoading,
  } = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })
  const { favoriteIds } = useInventoryFavorites()
  const { data: vmStatuses, isLoading: isVmStatusLoading } =
    useQuery(vmStatusQueryOptions)
  const visiblePods = useMemo(() => catalog ?? [], [catalog])
  const cloneStatus = useQueries({
    queries: visiblePods.map((pod) => clonedPodQueryOptions(pod.slug)),
    combine: (results) => {
      const entries = results.flatMap<ClonedPodEntry>((result, index) => {
        const clonedPod = result.data
        const pod = visiblePods[index]

        return clonedPod ? [{ clonedPod, pod }] : []
      })
      const current = entries.reduce<ClonedPodEntry | null>(
        (latest, entry) =>
          latest &&
          toTime(latest.clonedPod.cloned_at) >=
            toTime(entry.clonedPod.cloned_at)
            ? latest
            : entry,
        null
      )

      return {
        current,
        entries,
        error: results.find((result) => result.error)?.error ?? null,
        isLoading: results.some((result) => result.isLoading),
      }
    },
  })

  const inventoryStats = useMemo(
    () => countAccessibleInventory(tree ?? []),
    [tree]
  )

  const inventoryItemsById = useMemo(
    () => indexInventoryTree(tree ?? []),
    [tree]
  )

  const runningVms = useMemo(
    () => countRunningVms(inventoryItemsById, vmStatuses),
    [inventoryItemsById, vmStatuses]
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
      [...(pendingRequests ?? []), ...(historyRequests ?? [])].sort(
        (left, right) => getRequestSortTime(right) - getRequestSortTime(left)
      ),
    [historyRequests, pendingRequests]
  )

  const recentPods = useMemo(
    () =>
      visiblePods
        .slice()
        .sort(
          (left, right) => toTime(right.created_at) - toTime(left.created_at)
        )
        .slice(0, 3),
    [visiblePods]
  )
  const questionActivityHeatmapData = useMemo(
    () => buildQuestionActivityHeatmapData(questionActivity ?? []),
    [questionActivity]
  )

  const activityColumns = useMemo(
    () =>
      getDashboardActivityColumns({
        onOpen: (request) => setSelectedRequestId(request.id),
        tree,
      }),
    [tree]
  )

  const activityError = pendingRequestsError ?? historyRequestsError
  const questionActivityLoadError =
    questionActivityError instanceof Error ? questionActivityError : null

  const activityLoading = isPendingRequestsLoading || isHistoryRequestsLoading
  const isDashboardLoading =
    isTreeLoading ||
    activityLoading ||
    isCatalogLoading ||
    isQuestionActivityLoading ||
    cloneStatus.isLoading ||
    isVmStatusLoading

  const stats = [
    {
      icon: IconDeviceDesktop,
      label: "Virtual Machines",
      value: String(inventoryStats.vms),
    },
    {
      icon: IconPlayerPlay,
      label: "Running VMs",
      value: String(runningVms),
    },
    {
      icon: IconCopy,
      label: "Cloned Pods",
      value: String(cloneStatus.entries.length),
    },
    {
      icon: IconClock,
      label: "Pending Requests",
      value: String(pendingRequests?.length ?? 0),
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
          data={questionActivityHeatmapData}
          error={questionActivityLoadError}
        />
        <DashboardCurrentClonedPodCard
          className="xl:col-span-8"
          entry={cloneStatus.current}
          error={cloneStatus.error}
        />
        <DashboardRecentPodsCard
          className="xl:col-span-7"
          error={catalogError}
          pods={recentPods}
          totalPods={visiblePods.length}
        />
        <DashboardFavoritesCard
          className="xl:col-span-5"
          favorites={favorites}
          vmStatuses={vmStatuses}
        />

        <DashboardActivityTableCard
          className="xl:col-span-12"
          columns={activityColumns}
          data={requests}
          error={activityError}
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
            error={requestDetailError}
            isLoading={isRequestDetailLoading}
            onApprove={() => {}}
            onDeny={() => {}}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedRequestId(null)
              }
            }}
            open={true}
            request={requestDetail ?? null}
            tree={tree}
          />
        )}
      </Suspense>
    </div>
  )
}

function getRequestSortTime(request: ApiRequestSummary) {
  const value = request.updated_at ?? request.created_at
  if (!value) return 0
  return new Date(value).getTime()
}

function countAccessibleInventory(nodes: Array<ApiTreeNode>): {
  folders: number
  vms: number
} {
  return nodes.reduce(
    (counts, node) => {
      if (node.kind === "folder") {
        counts.folders += 1
      } else {
        counts.vms += 1
      }

      if (node.children) {
        const childCounts = countAccessibleInventory(node.children)
        counts.folders += childCounts.folders
        counts.vms += childCounts.vms
      }

      return counts
    },
    { folders: 0, vms: 0 }
  )
}

function indexInventoryTree(nodes: Array<ApiTreeNode>) {
  const items = new Map<string, ApiTreeNode>()

  const visit = (entries: Array<ApiTreeNode>) => {
    for (const entry of entries) {
      items.set(entry.id, entry)
      if (entry.children) {
        visit(entry.children)
      }
    }
  }

  visit(nodes)

  return items
}

function countRunningVms(
  inventoryItemsById: Map<string, ApiTreeNode>,
  vmStatuses: Record<number, string> | undefined
) {
  let running = 0

  for (const item of inventoryItemsById.values()) {
    if (item.kind !== "vm" || !item.vm) continue
    if (item.vm.is_template) continue

    if (vmStatuses?.[item.vm.vmid] === "running") {
      running += 1
    }
  }

  return running
}

function toTime(value: string | null | undefined) {
  return value ? new Date(value).getTime() : 0
}

function buildQuestionActivityHeatmapData(
  answers: Array<PodQuestionActivityAnswer>
): Array<HeatmapColumn> {
  const today = new Date()
  const startDate = new Date(
    today.getFullYear(),
    today.getMonth() - 6,
    today.getDate()
  )
  const todayKey = toLocalDateKey(today)
  const startDateKey = toLocalDateKey(startDate)
  const countsByDate = new Map<string, number>()

  for (const answer of answers) {
    const answeredAt = new Date(answer.answered_at)
    const dateKey = toLocalDateKey(answeredAt)

    if (
      Number.isNaN(answeredAt.getTime()) ||
      dateKey < startDateKey ||
      dateKey > todayKey
    ) {
      continue
    }

    countsByDate.set(dateKey, (countsByDate.get(dateKey) ?? 0) + 1)
  }

  const data: Array<HeatmapColumn> = []
  const firstWeekStart = startOfLocalWeek(startDate)
  let weekIndex = 0

  for (
    let weekStart = new Date(firstWeekStart);
    toLocalDateKey(weekStart) <= todayKey;
    weekStart.setDate(weekStart.getDate() + 7)
  ) {
    const bins: HeatmapColumn["bins"] = []

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + dayIndex)
      const dateKey = toLocalDateKey(date)

      if (dateKey > todayKey) {
        break
      }

      bins.push({
        bin: dayIndex,
        count: dateKey >= startDateKey ? (countsByDate.get(dateKey) ?? 0) : 0,
        date,
      })
    }

    data.push({ bin: weekIndex, bins })
    weekIndex += 1
  }

  return data
}

function startOfLocalWeek(date: Date) {
  const start = new Date(date)
  start.setDate(start.getDate() - start.getDay())
  return start
}

function toLocalDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${date.getFullYear()}-${month}-${day}`
}
