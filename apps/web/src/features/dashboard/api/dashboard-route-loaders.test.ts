import { beforeEach, describe, expect, it, vi } from "vitest"
import { preloadUserDashboard } from "./dashboard-route-loaders"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"
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
