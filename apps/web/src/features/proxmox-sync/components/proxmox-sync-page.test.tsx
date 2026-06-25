import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { ProxmoxSyncPage } from "./proxmox-sync-page"
import { renderWithQueryClient } from "@/test/test-utils"

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useRouteContext: () => ({
      user: { management_permissions: 4 },
    }),
  }),
  Navigate: () => null,
}))

vi.mock("@/features/auth/utils/management-permissions", () => ({
  hasManagementPermission: () => true,
  canAccessAdmin: () => true,
  ManagementPermissionKeys: { administrator: 2 },
}))

vi.mock("@/features/inventory/api/inventory-api", () => ({
  inventoryTreeQueryOptions: {
    queryKey: ["inventory", "tree"],
    queryFn: () => Promise.resolve([]),
  },
}))

vi.mock("@/features/proxmox-sync/api/proxmox-sync-api", () => ({
  proxmoxSyncPreviewQueryOptions: {
    queryKey: ["proxmox", "sync", "preview"],
    queryFn: () => Promise.reject(new Error("Network error")),
  },
  applyProxmoxSync: vi.fn(),
}))

describe("ProxmoxSyncPage", () => {
  it("renders error alert instead of Synced when query fails", async () => {
    renderWithQueryClient(<ProxmoxSyncPage />)

    expect(await screen.findByText(/Network error/)).toBeInTheDocument()
    expect(screen.queryByText("Synced")).not.toBeInTheDocument()
  })
})
