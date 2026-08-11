import { Suspense, lazy, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Clock01Icon,
  ComputerIcon,
  CopyIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons"
import { DashboardActivityTableCard } from "./dashboard-requests-card"
import { getDashboardActivityColumns } from "./dashboard-requests-columns"
import { DashboardCurrentClonedPodCard } from "./dashboard-cloned-pod-card"
import { DashboardFavoritesCard } from "./dashboard-favorites-card"
import { DashboardProfileCard } from "./dashboard-profile-card"
import { DashboardQuestionActivityCard } from "./dashboard-question-activity-card"
import { DashboardRecentPodsCard } from "./dashboard-published-pods-card"
import { DashboardStatsGrid } from "./dashboard-stat-cards"
import type { ClonedPodEntry } from "../utils/dashboard-types"
import type { HeatmapColumn } from "@workspace/ui/components/charts/heatmap"
import type { AuthUser } from "@/features/auth/types/auth-types"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { PodQuestionActivityAnswer } from "@/features/pods/types/pod-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import { PreloadOverlay } from "@/components/loading-overlay"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { getManagementRoleLabel } from "@/features/auth/utils/management-permissions"
import { principalProviderQueryOptions } from "@/features/principals/api/principals-api"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { useInventoryFavorites } from "@/features/inventory/hooks/use-inventory-favorites"
import { indexInventoryTree } from "@/features/inventory/utils/inventory-tree"
import {
  catalogCloneSummariesQueryOptions,
  podQuestionActivityQueryOptions,
} from "@/features/pods/api/clone-pod-api"
import { personalPodQueryOptions } from "@/features/pods/api/personal-pod-api"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"
import { PersonalPodCard } from "@/features/pods/components/browse/personal-pod-card"
import {
  requestDetailQueryOptions,
  requesterRequestSummariesQueryOptions,
  requesterRequestSummaryCountQueryOptions,
} from "@/features/requests/api/requests-api"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"
import { useScrollRestoreOnReady } from "@/features/dashboard/hooks/use-scroll-restore-on-ready"

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

  const {
    data: tree,
    error: treeError,
    isPending: isTreePending,
    isLoading: isTreeLoading,
  } = useQuery(inventoryTreeQueryOptions)
  const {
    data: providerCapabilities,
    error: providerError,
    isLoading: isProviderLoading,
  } = useQuery(principalProviderQueryOptions)
  const canChangeOwnPassword = isProviderLoading
    ? false
    : providerError
      ? false
      : (providerCapabilities?.can_change_own_password ?? false)
  const { data: personalPodStatus, isLoading: isPersonalPodLoading } = useQuery(
    personalPodQueryOptions
  )
  const {
    data: pendingRequests,
    error: pendingRequestsError,
    isPending: isPendingRequestsPending,
    isLoading: isPendingRequestsLoading,
  } = useQuery(requesterRequestSummariesQueryOptions("pending"))
  const {
    data: pendingRequestsTotal,
    error: pendingRequestsTotalError,
    isLoading: isPendingRequestsTotalLoading,
  } = useQuery(requesterRequestSummaryCountQueryOptions("pending"))
  const {
    data: historyRequests,
    error: historyRequestsError,
    isPending: isHistoryRequestsPending,
    isLoading: isHistoryRequestsLoading,
  } = useQuery(requesterRequestSummariesQueryOptions("history"))
  const {
    data: catalog,
    error: catalogError,
    isPending: isCatalogPending,
  } = useQuery(podCatalogQueryOptions)
  const {
    data: questionActivity,
    error: questionActivityError,
    isPending: isQuestionActivityPending,
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
  const {
    data: vmStatuses,
    error: vmStatusError,
    isPending: isVmStatusPending,
    isLoading: isVmStatusLoading,
  } = useQuery(vmStatusQueryOptions)
  const visiblePods = useMemo(() => catalog ?? [], [catalog])
  const {
    data: cloneSummaries,
    error: cloneSummariesError,
    isPending: isCloneSummariesPending,
    isLoading: isCloneSummariesLoading,
  } = useQuery(catalogCloneSummariesQueryOptions())

  const cloneStatus = useMemo(() => {
    if (!cloneSummaries) {
      return {
        current: null,
        entries: [] as Array<ClonedPodEntry>,
        error:
          cloneSummariesError instanceof Error ? cloneSummariesError : null,
        isLoading: isCloneSummariesLoading,
      }
    }

    const entries: Array<ClonedPodEntry> = cloneSummaries.map((item) => ({
      clonedPod: {
        id: item.summary.id,
        pod_id: item.summary.pod_id,
        owner: { id: "", type: "user", label: "", description: "" },
        cloned_at: item.summary.cloned_at,
        status: item.summary.status,
        network: {
          number: 0,
          vnet: "",
          external_subnet: "",
          internal_subnet: "",
          profile_key: "lan-router-v1",
        },
        vms: [],
        question_summary: item.summary.question_summary,
        task_states: [],
        question_answers: [],
      },
      pod: {
        id: item.pod.id,
        slug: item.pod.slug,
        title: item.pod.title,
        description: item.pod.description,
        image: item.pod.image_url,
        creators: [],
        created_at: "",
        clone_count: 0,
        status: "listed" as const,
        audience: [],
        source_folder: "",
        clone_target_key: "",
        virtual_machines: [],
      },
    }))

    const current = entries.reduce<ClonedPodEntry | null>(
      (latest, entry) =>
        latest &&
        toTime(latest.clonedPod.cloned_at) >= toTime(entry.clonedPod.cloned_at)
          ? latest
          : entry,
      null
    )

    return {
      current,
      entries,
      error: cloneSummariesError instanceof Error ? cloneSummariesError : null,
      isLoading: isCloneSummariesLoading,
    }
  }, [cloneSummaries, cloneSummariesError, isCloneSummariesLoading])

  const clonedPodIds = useMemo(
    () =>
      cloneSummaries
        ? new Set(cloneSummaries.map((item) => item.summary.pod_id))
        : new Set<string>(),
    [cloneSummaries]
  )

  const inventoryStats = useMemo(
    () => (tree ? countAccessibleInventory(tree) : null),
    [tree]
  )

  const inventoryItemsById = useMemo(
    () => (tree ? indexInventoryTree(tree) : null),
    [tree]
  )

  const runningVms = useMemo(() => {
    if (!inventoryItemsById || !vmStatuses) {
      return null
    }
    return countRunningVms(inventoryItemsById, vmStatuses)
  }, [inventoryItemsById, vmStatuses])

  const favorites = useMemo(() => {
    if (!inventoryItemsById) {
      return []
    }
    return Array.from(favoriteIds)
      .map((itemId) => inventoryItemsById.get(itemId))
      .filter((item): item is NonNullable<typeof item> => !!item)
  }, [favoriteIds, inventoryItemsById])

  const requests = useMemo(() => {
    if (pendingRequestsError || historyRequestsError) {
      return []
    }
    if (!pendingRequests && isPendingRequestsLoading) {
      return []
    }
    if (!historyRequests && isHistoryRequestsLoading) {
      return []
    }
    return [...(pendingRequests ?? []), ...(historyRequests ?? [])].sort(
      (left, right) => getRequestSortTime(right) - getRequestSortTime(left)
    )
  }, [
    historyRequests,
    historyRequestsError,
    isHistoryRequestsLoading,
    isPendingRequestsLoading,
    pendingRequests,
    pendingRequestsError,
  ])

  const recentPods = useMemo(() => {
    if (catalogError || catalog === undefined) {
      return []
    }
    return visiblePods
      .slice()
      .sort((left, right) => toTime(right.created_at) - toTime(left.created_at))
  }, [catalog, catalogError, visiblePods])
  const questionActivityHeatmapData = useMemo(
    () =>
      questionActivityError || questionActivity === undefined
        ? []
        : buildQuestionActivityHeatmapData(questionActivity),
    [questionActivity, questionActivityError]
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
  const primaryStatsError =
    treeError ?? vmStatusError ?? pendingRequestsTotalError ?? providerError

  const isDashboardLoading =
    isTreePending ||
    isVmStatusPending ||
    isPendingRequestsPending ||
    isHistoryRequestsPending ||
    isCatalogPending ||
    isQuestionActivityPending ||
    isCloneSummariesPending

  useScrollRestoreOnReady(!isDashboardLoading)

  const stats = [
    {
      icon: ComputerIcon,
      label: "Virtual Machines",
      value: formatDashboardStat(isTreeLoading, treeError, inventoryStats?.vms),
    },
    {
      icon: PlayIcon,
      label: "Running VMs",
      value: formatDashboardStat(
        isTreeLoading || isVmStatusLoading,
        treeError ?? vmStatusError,
        runningVms
      ),
    },
    {
      icon: CopyIcon,
      label: "Cloned Pods",
      value: formatDashboardStat(
        cloneStatus.isLoading,
        cloneSummariesError,
        cloneStatus.entries.length
      ),
    },
    {
      icon: Clock01Icon,
      label: "Pending Requests",
      value: formatDashboardStat(
        isPendingRequestsTotalLoading,
        pendingRequestsTotalError,
        pendingRequestsTotal
      ),
    },
  ]
  const roleLabel = getManagementRoleLabel(user.management_permissions)

  return (
    <div className="@container/main relative flex flex-1 flex-col gap-2">
      <PreloadOverlay active={isDashboardLoading} label="Loading dashboard" />
      <div className="grid grid-cols-1 gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6 xl:grid-cols-12">
        {primaryStatsError ? (
          <div className="xl:col-span-12">
            <InlineErrorAlert
              error={primaryStatsError}
              fallback="Failed to load dashboard statistics."
              title="Statistics unavailable"
            />
          </div>
        ) : null}
        <DashboardStatsGrid className="xl:col-span-7" stats={stats} />
        <DashboardProfileCard
          className="xl:col-span-5"
          roleLabel={roleLabel}
          user={user}
          onSettingsClick={
            canChangeOwnPassword ? () => setSettingsOpen(true) : undefined
          }
        />
        {!isPersonalPodLoading && personalPodStatus?.configured ? (
          <PersonalPodCard
            className="xl:col-span-12"
            status={personalPodStatus}
            username={user.username}
          />
        ) : null}
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
          clonedPodIds={clonedPodIds}
          error={catalogError}
          pods={recentPods}
        />
        <div className="relative min-h-0 xl:col-span-5">
          <DashboardFavoritesCard
            className="max-h-144 min-h-0 xl:absolute xl:inset-0 xl:max-h-none"
            favorites={favorites}
            isTreeLoading={isTreeLoading}
            treeError={treeError}
            vmStatuses={vmStatuses}
          />
        </div>

        <DashboardActivityTableCard
          className="xl:col-span-12"
          columns={activityColumns}
          data={requests}
          error={activityError}
        />
      </div>

      <Suspense fallback={null}>
        {settingsOpen && canChangeOwnPassword ? (
          <ChangePasswordDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />
        ) : null}
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

function formatDashboardStat(
  isLoading: boolean,
  error: unknown,
  value: number | null | undefined
) {
  if (isLoading || error || value === null || value === undefined) {
    return "—"
  }
  return String(value)
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
