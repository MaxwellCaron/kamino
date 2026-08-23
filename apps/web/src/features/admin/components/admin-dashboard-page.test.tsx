import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import { AdminDashboardPage } from "./admin-dashboard-page"
import type { ApiClusterUsageHistoryResponse } from "../api/admin-metrics-api"
import type { AuthUser } from "@/features/auth/types/auth-types"
import type { ApiStorage } from "@/features/vms/types/vm-types"
import { renderWithQueryClient } from "@/test/test-utils"

type MockUsageAreaChartProps = {
  isLoading?: boolean
  label: string
  total: number
  used: number
}

const {
  mockUsersQueryFn,
  mockGroupsQueryFn,
  mockInventoryTreeQueryFn,
  mockPendingSummariesQueryFn,
  mockPendingRequestCountQueryFn,
  mockCompletedRequestCountQueryFn,
  mockNodesQueryFn,
  mockStoragesQueryFn,
  mockClusterHistoryQueryFn,
} = vi.hoisted(() => ({
  mockUsersQueryFn: vi.fn(),
  mockGroupsQueryFn: vi.fn(),
  mockInventoryTreeQueryFn: vi.fn(),
  mockPendingSummariesQueryFn: vi.fn(),
  mockPendingRequestCountQueryFn: vi.fn(),
  mockCompletedRequestCountQueryFn: vi.fn(),
  mockNodesQueryFn: vi.fn(),
  mockStoragesQueryFn: vi.fn(),
  mockClusterHistoryQueryFn: vi.fn(),
}))

vi.mock("@/features/principals/api/principals-api", () => ({
  usersQueryOptions: {
    queryKey: ["principals", "users"],
    queryFn: mockUsersQueryFn,
  },
  groupsQueryOptions: {
    queryKey: ["principals", "groups"],
    queryFn: mockGroupsQueryFn,
  },
}))

vi.mock("@/features/inventory/api/inventory-api", () => ({
  inventoryTreeQueryOptions: {
    queryKey: ["inventory", "tree"],
    queryFn: mockInventoryTreeQueryFn,
  },
}))

vi.mock("@/features/requests/api/requests-api", () => ({
  requestSummariesQueryOptions: () => ({
    queryKey: ["requests", "admin", "pending"],
    queryFn: mockPendingSummariesQueryFn,
  }),
  requestSummaryCountQueryOptions: (scope: string) => ({
    queryKey: ["requests", "admin", scope, "count"],
    queryFn:
      scope === "pending"
        ? mockPendingRequestCountQueryFn
        : mockCompletedRequestCountQueryFn,
  }),
  requestDetailQueryOptions: (requestId: string) => ({
    queryKey: ["requests", requestId],
    queryFn: vi.fn(),
    enabled: !!requestId,
  }),
  approveRequest: vi.fn(),
  denyRequest: vi.fn(),
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

vi.mock("./admin-dashboard-pending-requests-card", () => ({
  AdminDashboardPendingRequestsCard: () => null,
}))

vi.mock("./admin-dashboard-action-buttons", () => ({
  AdminDashboardActionButtons: () => null,
}))

vi.mock("./admin-dashboard-principals-cards", () => ({
  AdminDashboardPrincipalsCards: () => null,
}))

vi.mock("./usage-charts", () => ({
  UsageAreaChart: ({
    isLoading = false,
    label,
    total,
    used,
  }: MockUsageAreaChartProps) => (
    <div
      data-loading={String(isLoading)}
      data-testid={`usage-${label.toLowerCase()}`}
    >
      {used} / {total}
    </div>
  ),
}))

vi.mock("./admin-node-table", () => ({
  AdminNodeTable: () => null,
}))

vi.mock("./admin-shared-storage-table", () => ({
  AdminSharedStorageTable: () => null,
}))

const testUser: AuthUser = {
  id: "admin-1",
  username: "admin",
  group_count: 0,
  management_permissions: { grants: ["manager"] },
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function resolveAdminDefaults() {
  mockUsersQueryFn.mockResolvedValue([])
  mockGroupsQueryFn.mockResolvedValue([])
  mockInventoryTreeQueryFn.mockResolvedValue([])
  mockPendingSummariesQueryFn.mockResolvedValue([])
  mockPendingRequestCountQueryFn.mockResolvedValue(0)
  mockCompletedRequestCountQueryFn.mockResolvedValue(0)
  mockNodesQueryFn.mockResolvedValue([
    {
      node: "pve-1",
      status: "online",
      cpu: 0.1,
      maxcpu: 8,
      mem: 1,
      maxmem: 16,
    },
  ])
  mockStoragesQueryFn.mockResolvedValue([])
  mockClusterHistoryQueryFn.mockResolvedValue({
    points: [],
    nodes: [],
    shared_storages: [],
  })
}

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    mockUsersQueryFn.mockReset()
    mockGroupsQueryFn.mockReset()
    mockInventoryTreeQueryFn.mockReset()
    mockPendingSummariesQueryFn.mockReset()
    mockPendingRequestCountQueryFn.mockReset()
    mockCompletedRequestCountQueryFn.mockReset()
    mockNodesQueryFn.mockReset()
    mockStoragesQueryFn.mockReset()
    mockClusterHistoryQueryFn.mockReset()
    resolveAdminDefaults()
  })

  it("mounts the cluster section while principals are still loading", async () => {
    mockUsersQueryFn.mockReturnValue(new Promise(() => {}))

    renderWithQueryClient(<AdminDashboardPage user={testUser} />)

    expect(await screen.findByText("Cluster")).toBeInTheDocument()
  })

  it("shows current usage while chart history is still loading", async () => {
    const storageDeferred = createDeferred<Array<ApiStorage>>()
    const historyDeferred = createDeferred<ApiClusterUsageHistoryResponse>()
    mockStoragesQueryFn.mockReturnValue(storageDeferred.promise)
    mockClusterHistoryQueryFn.mockReturnValue(historyDeferred.promise)

    renderWithQueryClient(<AdminDashboardPage user={testUser} />)

    expect(screen.queryByLabelText("Loading cluster")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-cpu")).not.toBeInTheDocument()

    storageDeferred.resolve([
      {
        storage: "local-lvm",
        type: "lvmthin",
        content: "images",
        avail: 768,
        total: 1024,
        used: 256,
        shared: 0,
        kamino_shared: false,
        kamino_excluded: false,
      },
    ])

    expect(await screen.findByTestId("usage-cpu")).toHaveTextContent("0.8 / 8")
    expect(screen.getByTestId("usage-cpu")).toHaveAttribute(
      "data-loading",
      "true"
    )
    expect(screen.getByTestId("usage-memory")).toHaveTextContent("1 / 16")
    expect(screen.getByTestId("usage-memory")).toHaveAttribute(
      "data-loading",
      "true"
    )
    expect(screen.getByTestId("usage-storage")).toHaveTextContent("256 / 1024")
    expect(screen.getByTestId("usage-storage")).toHaveAttribute(
      "data-loading",
      "true"
    )

    historyDeferred.resolve({ points: [], nodes: [], shared_storages: [] })

    await waitFor(() => {
      expect(screen.getByTestId("usage-cpu")).toHaveAttribute(
        "data-loading",
        "false"
      )
    })
    expect(screen.getByTestId("usage-memory")).toHaveAttribute(
      "data-loading",
      "false"
    )
    expect(screen.getByTestId("usage-storage")).toHaveAttribute(
      "data-loading",
      "false"
    )
  })
})
