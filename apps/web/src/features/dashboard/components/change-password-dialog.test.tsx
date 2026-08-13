import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChangePasswordDialog } from "./change-password-dialog"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import {
  authSessionQueryOptions,
  changeOwnPassword,
} from "@/features/auth/api/auth-api"
import { createTestQueryClient, renderWithQueryClient } from "@/test/test-utils"

vi.mock("@/components/feedback/mutation-progress-toast", () => ({
  showSingleMutationToast: vi.fn(),
}))

vi.mock("@/features/auth/api/auth-api", () => ({
  authSessionQueryOptions: { queryKey: ["auth", "session"] },
  changeOwnPassword: vi.fn(),
}))

describe("ChangePasswordDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalidates the cached session after changing the password", async () => {
    vi.mocked(changeOwnPassword).mockResolvedValue()
    const queryClient = createTestQueryClient()
    queryClient.invalidateQueries = vi.fn().mockResolvedValue(undefined)

    renderWithQueryClient(
      <ChangePasswordDialog open onOpenChange={vi.fn()} />,
      queryClient
    )

    fireEvent.change(screen.getByLabelText("Current Password"), {
      target: { value: "old-password" },
    })
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "new-password" },
    })
    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: "new-password" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Update" }))

    await waitFor(() => {
      expect(showSingleMutationToast).toHaveBeenCalledOnce()
    })
    const promise = vi.mocked(showSingleMutationToast).mock.calls[0][0].promise
    await promise

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: authSessionQueryOptions.queryKey,
      exact: true,
    })
  })
})
