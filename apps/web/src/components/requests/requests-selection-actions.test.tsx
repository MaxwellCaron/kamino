import type * as ActionBarModule from "@workspace/ui/components/action-bar"
import type * as MutationProgressToastModule from "@/components/feedback/mutation-progress-toast"
import { act, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ApiRequestSummary } from "@/lib/requests/request-types"
import { createElement } from "react"
import { renderWithQueryClient } from "@/test/test-utils"
import { runMutationUnits } from "@/lib/mutation-progress-toast"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"

vi.mock("@/lib/requests/request-presenters", () => ({
  formatRequestKind: () => "Create",
  formatRequestPowerAction: () => null,
  getRequestIcon: () => null,
}))

vi.mock(
  "@/components/feedback/mutation-progress-toast",
  async (importOriginal) => ({
    ...(await importOriginal<typeof MutationProgressToastModule>()),
    showUnitMutationToast: vi.fn(),
  })
)

vi.mock("@workspace/ui/components/action-bar", async (importOriginal) => {
  const actual = await importOriginal<typeof ActionBarModule>()
  return {
    ...actual,
    ActionBarItem: ({
      onClick,
      children,
      ...rest
    }: {
      onClick: () => void
      children: React.ReactNode
      [key: string]: unknown
    }) => createElement("button", { onClick, ...rest }, children),
    ActionBarSeparator: () => null,
  }
})

const mockRequest = {
  id: "req-1",
  kind: "create",
  status: "pending",
  created_at: "2024-01-01T00:00:00Z",
  inventory: {
    item_id: "item-1",
    item_name: "Test VM",
    vmid: 100,
    power_action: null,
    snapshot_name: null,
  },
} as ApiRequestSummary

describe("RequestsSelectionActions", () => {
  it("calls mutateAsync for deny and does not clear selection on rejection", async () => {
    const clearSelection = vi.fn()
    const denyMutation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("Server error")),
    }
    const approveMutation = { mutateAsync: vi.fn() }
    let capturedOnConfirm: (() => void) | null = null
    const onOpenConfirm = vi.fn((config) => {
      capturedOnConfirm = config.onConfirm
    })

    const { RequestsSelectionActions } =
      await import("@/components/requests/requests-selection-actions")

    renderWithQueryClient(
      <RequestsSelectionActions
        selectedRows={[mockRequest]}
        clearSelection={clearSelection}
        approveMutation={approveMutation as never}
        denyMutation={denyMutation as never}
        onOpenConfirm={onOpenConfirm}
      />
    )

    screen.getByLabelText("Deny selected requests").click()

    expect(onOpenConfirm).toHaveBeenCalled()
    expect(capturedOnConfirm).not.toBeNull()

    await act(async () => {
      capturedOnConfirm!()
      const config = vi.mocked(showUnitMutationToast).mock.calls.at(-1)![0]
      config.onSettled?.(await runMutationUnits(config.units, () => {}, 1))
    })

    expect(denyMutation.mutateAsync).toHaveBeenCalledWith(["req-1"])
    expect(clearSelection).not.toHaveBeenCalled()
  })

  it("calls mutateAsync for deny and clears selection on success", async () => {
    const clearSelection = vi.fn()
    const denyMutation = {
      mutateAsync: vi.fn().mockResolvedValue({
        failed: [],
        succeeded: ["req-1"],
      }),
    }
    const approveMutation = { mutateAsync: vi.fn() }
    let capturedOnConfirm: (() => void) | null = null
    const onOpenConfirm = vi.fn((config) => {
      capturedOnConfirm = config.onConfirm
    })

    const { RequestsSelectionActions } =
      await import("@/components/requests/requests-selection-actions")

    renderWithQueryClient(
      <RequestsSelectionActions
        selectedRows={[mockRequest]}
        clearSelection={clearSelection}
        approveMutation={approveMutation as never}
        denyMutation={denyMutation as never}
        onOpenConfirm={onOpenConfirm}
      />
    )

    screen.getByLabelText("Deny selected requests").click()

    await act(async () => {
      capturedOnConfirm!()
      const config = vi.mocked(showUnitMutationToast).mock.calls.at(-1)![0]
      config.onSettled?.(await runMutationUnits(config.units, () => {}, 1))
    })

    expect(clearSelection).toHaveBeenCalled()
  })
})
