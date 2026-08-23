import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Clock01Icon,
  ComputerIcon,
  CopyIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons"
import { getDashboardActivityColumns } from "../components/dashboard-requests-columns"
import type { ClonedPodEntry, DashboardStat } from "../utils/dashboard-types"
import type { HeatmapColumn } from "@workspace/ui/components/charts/heatmap"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { PodQuestionActivityAnswer } from "@/features/pods/types/pod-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
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
import {
  requestDetailQueryOptions,
  requesterRequestSummariesQueryOptions,
  requesterRequestSummaryCountQueryOptions,
} from "@/features/requests/api/requests-api"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"

export function useDashboardHomeData(
  selectedRequestId: string | null,
  onOpenRequest: (requestId: string) => void
) {
  const inventory = useDashboardInventoryData()
  const profile = useDashboardProfileData()
  const requests = useDashboardRequestData(
    selectedRequestId,
    onOpenRequest,
    inventory.tree
  )
  const pods = useDashboardPodData()

  const stats: Array<DashboardStat> = [
    {
      icon: ComputerIcon,
      label: "Virtual Machines",
      value: formatDashboardStat(
        inventory.isTreeLoading,
        inventory.treeError,
        inventory.vmCount
      ),
    },
    {
      icon: PlayIcon,
      label: "Running VMs",
      value: formatDashboardStat(
        inventory.isTreeLoading || inventory.isVmStatusLoading,
        inventory.treeError ?? inventory.vmStatusError,
        inventory.runningVms
      ),
    },
    {
      icon: CopyIcon,
      label: "Cloned Pods",
      value: formatDashboardStat(
        pods.cloneStatus.isLoading,
        pods.cloneSummariesError,
        pods.cloneStatus.entries.length
      ),
    },
    {
      icon: Clock01Icon,
      label: "Pending Requests",
      value: formatDashboardStat(
        requests.isPendingCountLoading,
        requests.pendingCountError,
        requests.pendingCount
      ),
    },
  ]

  return {
    activity: requests.activity,
    canChangeOwnPassword: profile.canChangeOwnPassword,
    cloneStatus: pods.cloneStatus,
    favorites: inventory.favorites,
    isLoading:
      inventory.isPending || requests.isPending || pods.isPrimaryPending,
    isPersonalPodLoading: pods.isPersonalPodLoading,
    isRequestDetailLoading: requests.isRequestDetailLoading,
    isTreeLoading: inventory.isTreeLoading,
    personalPodStatus: pods.personalPodStatus,
    primaryStatsError:
      inventory.treeError ??
      inventory.vmStatusError ??
      requests.pendingCountError ??
      profile.error,
    questionActivity: pods.questionActivity,
    recentPods: pods.recentPods,
    requestDetail: requests.requestDetail,
    requestDetailError: requests.requestDetailError,
    stats,
    tree: inventory.tree,
    treeError: inventory.treeError,
    vmStatuses: inventory.vmStatuses,
  }
}

function useDashboardProfileData() {
  const {
    data: providerCapabilities,
    error,
    isLoading,
  } = useQuery(principalProviderQueryOptions)

  return {
    canChangeOwnPassword:
      !isLoading &&
      !error &&
      (providerCapabilities?.can_change_own_password ?? false),
    error,
  }
}

function useDashboardInventoryData() {
  const {
    data: tree,
    error: treeError,
    isPending: isTreePending,
    isLoading: isTreeLoading,
  } = useQuery(inventoryTreeQueryOptions)
  const {
    data: vmStatuses,
    error: vmStatusError,
    isPending: isVmStatusPending,
    isLoading: isVmStatusLoading,
  } = useQuery(vmStatusQueryOptions)
  const { favoriteIds } = useInventoryFavorites()

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

  return {
    favorites,
    isPending: isTreePending || isVmStatusPending,
    isTreeLoading,
    isVmStatusLoading,
    runningVms,
    tree,
    treeError,
    vmCount: inventoryStats?.vms,
    vmStatusError,
    vmStatuses,
  }
}

function useDashboardRequestData(
  selectedRequestId: string | null,
  onOpenRequest: (requestId: string) => void,
  tree: Array<ApiTreeNode> | undefined
) {
  const {
    data: pendingRequests,
    error: pendingRequestsError,
    isPending: isPendingRequestsPending,
    isLoading: isPendingRequestsLoading,
  } = useQuery(requesterRequestSummariesQueryOptions("pending"))
  const {
    data: pendingCount,
    error: pendingCountError,
    isLoading: isPendingCountLoading,
  } = useQuery(requesterRequestSummaryCountQueryOptions("pending"))
  const {
    data: historyRequests,
    error: historyRequestsError,
    isPending: isHistoryRequestsPending,
    isLoading: isHistoryRequestsLoading,
  } = useQuery(requesterRequestSummariesQueryOptions("history"))
  const {
    data: requestDetail,
    error: requestDetailError,
    isLoading: isRequestDetailLoading,
  } = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })
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
  const activityColumns = useMemo(
    () =>
      getDashboardActivityColumns({
        onOpen: (request) => onOpenRequest(request.id),
        tree,
      }),
    [onOpenRequest, tree]
  )

  return {
    activity: {
      columns: activityColumns,
      data: requests,
      error: pendingRequestsError ?? historyRequestsError,
    },
    isPending: isPendingRequestsPending || isHistoryRequestsPending,
    isPendingCountLoading,
    isRequestDetailLoading,
    pendingCount,
    pendingCountError,
    requestDetail,
    requestDetailError,
  }
}

function useDashboardPodData() {
  const { data: personalPodStatus, isLoading: isPersonalPodLoading } = useQuery(
    personalPodQueryOptions
  )
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
  const recentPods = useMemo(() => {
    if (catalogError || catalog === undefined) {
      return []
    }
    return catalog
      .slice()
      .sort((left, right) => toTime(right.created_at) - toTime(left.created_at))
  }, [catalog, catalogError])
  const questionActivityHeatmapData = useMemo(
    () =>
      questionActivityError || questionActivity === undefined
        ? []
        : buildQuestionActivityHeatmapData(questionActivity),
    [questionActivity, questionActivityError]
  )

  return {
    cloneStatus,
    cloneSummariesError,
    isPersonalPodLoading,
    isPrimaryPending:
      isCatalogPending || isQuestionActivityPending || isCloneSummariesPending,
    personalPodStatus,
    questionActivity: {
      data: questionActivityHeatmapData,
      error:
        questionActivityError instanceof Error ? questionActivityError : null,
    },
    recentPods: {
      clonedPodIds,
      error: catalogError,
      pods: recentPods,
    },
  }
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
