import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { SnapshotTableBody } from "./snapshot-table-body"
import type { SnapshotTablePermissions } from "./snapshot-table"
import type { ApiSnapshot } from "@/features/vms/types/vm-types"
import { renderWithQueryClient } from "@/test/test-utils"

vi.mock("@workspace/ui/components/relative-time-card", () => ({
  RelativeTimeCard: () => null,
}))

vi.mock("./snapshot-table-row-actions", () => ({
  SnapshotTableRowActions: () => null,
}))

vi.mock("@/components/loading-transition", () => ({
  loadingTransition: {},
}))

const permissions: SnapshotTablePermissions = {
  canView: true,
  canManage: true,
  canRequest: false,
}

const defaultProps = {
  isLoading: false,
  hasBeenLoading: false,
  filtered: [] as Array<ApiSnapshot>,
  error: null as Error | null,
  itemId: "item-1",
  permissions,
  onOpenConfirm: vi.fn(),
  onOpenRequestRollback: vi.fn(),
  rollback: {} as never,
  remove: {} as never,
  submitRollbackRequest: {} as never,
  toastRollbackSnapshot: vi.fn(),
  toastDeleteSnapshot: vi.fn(),
}

describe("SnapshotTableBody", () => {
  it("renders error message instead of empty state when error is present", () => {
    renderWithQueryClient(
      <table>
        <SnapshotTableBody
          {...defaultProps}
          error={new Error("Failed to load snapshots")}
        />
      </table>
    )

    expect(screen.queryByText("No snapshots found.")).not.toBeInTheDocument()
    expect(screen.getByText("Failed to load snapshots")).toBeInTheDocument()
  })
})
