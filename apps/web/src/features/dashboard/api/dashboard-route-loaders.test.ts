import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  preloadAdminDashboard,
  preloadUserDashboard,
} from "./dashboard-route-loaders"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"
import { clusterUsageHistoryQueryOptions } from "@/features/admin/api/admin-metrics-api"
import { nodesQueryOptions } from "@/features/vms/api/proxmox-options-api"
import { createTestQueryClient } from "@/test/test-utils"

const {
  mockInventoryTreeQueryFn,
  mockPrincipalProviderQueryFn,
  mockPersonalPodQueryFn,
  mockPendingSummariesQueryFn,
  mockPendingCountQueryFn,
  mockHistorySummariesQueryFn,
  mockPodCatalogQueryFn,
  mockQuestionActivityQueryFn,
  mockCloneSummariesQueryFn,
  mockVmStatusQueryFn,
  mockUsersQueryFn,
  mockGroupsQueryFn,
  mockAdminPendingSummariesQueryFn,
  mockPendingRequestCountQueryFn,
  mockCompletedRequestCountQueryFn,
  mockNodesQueryFn,
  mockStoragesQueryFn,
  mockClusterHistoryQueryFn,
} = vi.hoisted(() => ({
  mockInventoryTreeQueryFn: vi.fn(),
  mockPrincipalProviderQueryFn: vi.fn(),
  mockPersonalPodQueryFn: vi.fn(),
  mockPendingSummariesQueryFn: vi.fn(),
  mockPendingCountQueryFn: vi.fn(),
  mockHistorySummariesQueryFn: vi.fn(),
  mockPodCatalogQueryFn: vi.fn(),
  mockQuestionActivityQueryFn: vi.fn(),
  mockCloneSummariesQueryFn: vi.fn(),
  mockVmStatusQueryFn: vi.fn(),
  mockUsersQueryFn: vi.fn(),
  mockGroupsQueryFn: vi.fn(),
  mockAdminPendingSummariesQueryFn: vi.fn(),
  mockPendingRequestCountQueryFn: vi.fn(),
  mockCompletedRequestCountQueryFn: vi.fn(),
  mockNodesQueryFn: vi.fn(),
  mockStoragesQueryFn: vi.fn(),
  mockClusterHistoryQueryFn: vi.fn(),
}))

vi.mock("@/features/inventory/api/inventory-api", () => ({
  inventoryTreeQueryOptions: {
    queryKey: ["inventory", "tree"],
    queryFn: mockInventoryTreeQueryFn,
  },
}))

vi.mock("@/features/principals/api/principals-api", () => ({
  principalProviderQueryOptions: {
    queryKey: ["principals", "provider"],
    queryFn: mockPrincipalProviderQueryFn,
  },
  usersQueryOptions: {
    queryKey: ["principals", "users"],
    queryFn: mockUsersQueryFn,
  },
  groupsQueryOptions: {
    queryKey: ["principals", "groups"],
    queryFn: mockGroupsQueryFn,
  },
}))

vi.mock("@/features/pods/api/personal-pod-api", () => ({
  personalPodQueryOptions: {
    queryKey: ["pods", "personal"],
    queryFn: mockPersonalPodQueryFn,
  },
}))

vi.mock("@/features/requests/api/requests-api", () => ({
  requesterRequestSummariesQueryOptions: (scope: string) => ({
    queryKey: ["requests", "requester", scope],
    queryFn:
      scope === "pending"
        ? mockPendingSummariesQueryFn
        : mockHistorySummariesQueryFn,
  }),
  requesterRequestSummaryCountQueryOptions: () => ({
    queryKey: ["requests", "requester", "pending", "count"],
    queryFn: mockPendingCountQueryFn,
  }),
  requestSummariesQueryOptions: () => ({
    queryKey: ["requests", "admin", "pending"],
    queryFn: mockAdminPendingSummariesQueryFn,
  }),
  requestSummaryCountQueryOptions: (scope: string) => ({
    queryKey: ["requests", "admin", scope, "count"],
    queryFn:
      scope === "pending"
        ? mockPendingRequestCountQueryFn
        : mockCompletedRequestCountQueryFn,
  }),
}))

vi.mock("@/features/pods/api/publish-pod-api", () => ({
  podCatalogQueryOptions: {
    queryKey: ["pods", "catalog"],
    queryFn: mockPodCatalogQueryFn,
  },
}))

vi.mock("@/features/pods/api/clone-pod-api", () => ({
  podQuestionActivityQueryOptions: () => ({
    queryKey: ["pods", "question-activity"],
    queryFn: mockQuestionActivityQueryFn,
  }),
  catalogCloneSummariesQueryOptions: () => ({
    queryKey: ["pods", "catalog", "clones", "summary"],
    queryFn: mockCloneSummariesQueryFn,
  }),
}))

vi.mock("@/features/vms/api/vm-api", () => ({
  vmStatusQueryOptions: {
    queryKey: ["vms", "status"],
    queryFn: mockVmStatusQueryFn,
  },
}))

vi.mock("@/features/vms/api/proxmox-options-api", () => ({
  nodesQueryOptions: {
    queryKey: ["proxmox", "nodes"],
    queryFn: mockNodesQueryFn,
  },
  storagesQueryOptions: (node: string) => ({
    queryKey: ["proxmox", "storages", node],
    queryFn: () => mockStoragesQueryFn(node),
  }),
}))

vi.mock("@/features/admin/api/admin-metrics-api", () => ({
  clusterUsageHistoryQueryOptions: (timeframe: string) => ({
    queryKey: ["proxmox", "cluster", "usage-history", timeframe],
    queryFn: mockClusterHistoryQueryFn,
  }),
}))

function resetMocks() {
  mockInventoryTreeQueryFn.mockReset()
  mockPrincipalProviderQueryFn.mockReset()
  mockPersonalPodQueryFn.mockReset()
  mockPendingSummariesQueryFn.mockReset()
  mockPendingCountQueryFn.mockReset()
  mockHistorySummariesQueryFn.mockReset()
  mockPodCatalogQueryFn.mockReset()
  mockQuestionActivityQueryFn.mockReset()
  mockCloneSummariesQueryFn.mockReset()
  mockVmStatusQueryFn.mockReset()
  mockUsersQueryFn.mockReset()
  mockGroupsQueryFn.mockReset()
  mockAdminPendingSummariesQueryFn.mockReset()
  mockPendingRequestCountQueryFn.mockReset()
  mockCompletedRequestCountQueryFn.mockReset()
  mockNodesQueryFn.mockReset()
  mockStoragesQueryFn.mockReset()
  mockClusterHistoryQueryFn.mockReset()
}

function resolveUserDashboardDefaults() {
  mockInventoryTreeQueryFn.mockResolvedValue([])
  mockPrincipalProviderQueryFn.mockResolvedValue({
    can_change_own_password: true,
  })
  mockPersonalPodQueryFn.mockResolvedValue({ configured: false })
  mockPendingSummariesQueryFn.mockResolvedValue([])
  mockPendingCountQueryFn.mockResolvedValue(0)
  mockHistorySummariesQueryFn.mockResolvedValue([])
  mockPodCatalogQueryFn.mockResolvedValue([])
  mockQuestionActivityQueryFn.mockResolvedValue([])
  mockCloneSummariesQueryFn.mockResolvedValue([])
  mockVmStatusQueryFn.mockResolvedValue({})
}

function resolveAdminDashboardDefaults() {
  mockUsersQueryFn.mockResolvedValue([])
  mockGroupsQueryFn.mockResolvedValue([])
  mockInventoryTreeQueryFn.mockResolvedValue([])
  mockAdminPendingSummariesQueryFn.mockResolvedValue([])
  mockPendingRequestCountQueryFn.mockResolvedValue(0)
  mockCompletedRequestCountQueryFn.mockResolvedValue(0)
  mockNodesQueryFn.mockResolvedValue([{ node: "pve-1" }])
  mockStoragesQueryFn.mockResolvedValue([])
  mockClusterHistoryQueryFn.mockResolvedValue({
    points: [],
    nodes: [],
    shared_storages: [],
  })
}

describe("preloadUserDashboard", () => {
  let queryClient: ReturnType<typeof createTestQueryClient>

  beforeEach(() => {
    resetMocks()
    resolveUserDashboardDefaults()
    queryClient = createTestQueryClient()
  })

  it("starts independent queries before any one resolves", async () => {
    const started: Array<string> = []
    let releaseInventory!: () => void

    mockInventoryTreeQueryFn.mockImplementation(
      () =>
        new Promise((resolve) => {
          started.push("inventory")
          releaseInventory = () => resolve([])
        })
    )
    mockVmStatusQueryFn.mockImplementation(() => {
      started.push("vm-status")
      return Promise.resolve({})
    })

    const preloadPromise = preloadUserDashboard(queryClient)
    await Promise.resolve()
    expect(started).toContain("inventory")
    expect(started).toContain("vm-status")
    releaseInventory()
    await preloadPromise
  })

  it("keeps successful cache entries when another query rejects", async () => {
    mockInventoryTreeQueryFn.mockRejectedValue(new Error("inventory failed"))
    mockVmStatusQueryFn.mockResolvedValue({ 101: "running" })

    await preloadUserDashboard(queryClient)

    expect(queryClient.getQueryData(vmStatusQueryOptions.queryKey)).toEqual({
      101: "running",
    })
    expect(
      queryClient.getQueryState(inventoryTreeQueryOptions.queryKey)?.status
    ).toBe("error")
  })
})

describe("preloadAdminDashboard", () => {
  let queryClient: ReturnType<typeof createTestQueryClient>

  beforeEach(() => {
    resetMocks()
    resolveAdminDashboardDefaults()
    queryClient = createTestQueryClient()
  })

  it("starts cluster history before nodes resolve", async () => {
    const started: Array<string> = []
    let releaseNodes!: () => void

    mockNodesQueryFn.mockImplementation(
      () =>
        new Promise((resolve) => {
          started.push("nodes")
          releaseNodes = () => resolve([{ node: "pve-1" }])
        })
    )
    mockClusterHistoryQueryFn.mockImplementation(() => {
      started.push("history")
      return Promise.resolve({ points: [], nodes: [], shared_storages: [] })
    })

    const preloadPromise = preloadAdminDashboard(queryClient)
    await Promise.resolve()
    expect(started).toContain("nodes")
    expect(started).toContain("history")
    releaseNodes()
    await preloadPromise
  })

  it("preloads node storage after nodes resolve without blocking history", async () => {
    const started: Array<string> = []
    mockNodesQueryFn.mockImplementation(() => {
      started.push("nodes")
      return Promise.resolve([{ node: "pve-1" }])
    })
    mockStoragesQueryFn.mockImplementation((node: string) => {
      started.push(`storage:${node}`)
      return Promise.resolve([])
    })
    mockClusterHistoryQueryFn.mockImplementation(() => {
      started.push("history")
      return Promise.resolve({ points: [], nodes: [], shared_storages: [] })
    })

    await preloadAdminDashboard(queryClient)

    expect(started).toContain("history")
    expect(started).toContain("storage:pve-1")
    expect(
      queryClient.getQueryData(
        clusterUsageHistoryQueryOptions("hour").queryKey
      )
    ).toEqual({
      points: [],
      nodes: [],
      shared_storages: [],
    })
    expect(queryClient.getQueryData(nodesQueryOptions.queryKey)).toEqual([
      { node: "pve-1" },
    ])
  })
})
