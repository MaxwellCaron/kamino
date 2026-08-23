import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { DashboardHomePage } from "./dashboard-home-page"
import type { AuthUser } from "@/features/auth/types/auth-types"
import { renderWithQueryClient } from "@/test/test-utils"

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
  requestDetailQueryOptions: (requestId: string) => ({
    queryKey: ["requests", requestId],
    queryFn: vi.fn(),
    enabled: !!requestId,
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

vi.mock("@/features/inventory/hooks/use-inventory-favorites", () => ({
  useInventoryFavorites: () => ({
    favoriteIds: new Set<string>(),
    toggleFavorite: vi.fn(),
  }),
}))

vi.mock("@/components/grainient-background", () => ({
  GrainientBackground: () => null,
}))

vi.mock("@/features/dashboard/hooks/use-scroll-restore-on-ready", () => ({
  useScrollRestoreOnReady: () => {},
}))

vi.mock("./dashboard-question-activity-card", () => ({
  DashboardQuestionActivityCard: () => null,
}))

vi.mock("./dashboard-cloned-pod-card", () => ({
  DashboardCurrentClonedPodCard: () => null,
}))

vi.mock("./dashboard-published-pods-card", () => ({
  DashboardRecentPodsCard: () => null,
}))

vi.mock("./dashboard-favorites-card", () => ({
  DashboardFavoritesCard: () => null,
}))

vi.mock("./dashboard-requests-card", () => ({
  DashboardActivityTableCard: () => null,
}))

vi.mock("@/features/pods/components/browse/personal-pod-card", () => ({
  PersonalPodCard: () => null,
}))

const testUser: AuthUser = {
  id: "user-1",
  username: "tester",
  group_count: 0,
  management_permissions: { grants: [] },
}

function resolveDashboardDefaults() {
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

describe("DashboardHomePage", () => {
  beforeEach(() => {
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
    resolveDashboardDefaults()
  })

  it("shows statistics error and em dash values when inventory fails", async () => {
    mockInventoryTreeQueryFn.mockRejectedValue(new Error("Inventory failed"))

    renderWithQueryClient(<DashboardHomePage user={testUser} />)

    expect(await screen.findByText(/Inventory failed/)).toBeInTheDocument()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
    expect(screen.queryByText("0", { selector: "h3" })).not.toBeInTheDocument()
  })

  it("shows em dash for pending count and hides false zero when count fails", async () => {
    mockPendingCountQueryFn.mockRejectedValue(new Error("Count failed"))

    renderWithQueryClient(<DashboardHomePage user={testUser} />)

    expect(await screen.findByText(/Count failed/)).toBeInTheDocument()
    const pendingCard = screen
      .getByText("Pending Requests")
      .closest("[data-slot=card]")
    expect(pendingCard).toHaveTextContent("—")
    expect(pendingCard).not.toHaveTextContent("0")
  })

  it("does not show settings when provider capabilities fail", async () => {
    mockPrincipalProviderQueryFn.mockRejectedValue(
      new Error("Provider unavailable")
    )

    renderWithQueryClient(<DashboardHomePage user={testUser} />)

    expect(await screen.findByText(/Provider unavailable/)).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Settings" })
    ).not.toBeInTheDocument()
  })
})
