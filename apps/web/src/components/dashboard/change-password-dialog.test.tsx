import { beforeEach, describe, expect, it, vi } from "vitest"
import { createTestQueryClient, renderWithQueryClient } from "@/test/test-utils"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { ChangePasswordDialog } from "@/components/dashboard/change-password-dialog"
import { authSessionQueryOptions } from "@/lib/auth/auth-queries"
import { changeOwnPassword } from "@/lib/auth/auth-session"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"

vi.mock("@/components/feedback/mutation-progress-toast", () => ({
  showSingleMutationToast: vi.fn(),
}))

vi.mock("@/lib/auth/auth-session", () => ({
  changeOwnPassword: vi.fn(),
}))

vi.mock("@/lib/auth/auth-queries", () => ({
  authSessionQueryOptions: { queryKey: ["auth", "session"] },
}))

describe("ChangePasswordDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalidates the cached session after changing the password", async () => {
    vi.mocked(changeOwnPassword).mockResolvedValue()
    const queryClient = createTestQueryClient()
    queryClient.setQueryDefaults(authSessionQueryOptions.queryKey, {
      gcTime: Infinity,
    })
    queryClient.setQueryData(authSessionQueryOptions.queryKey, {
      user: {
        id: "user-1",
        username: "tester",
        group_count: 0,
        management_permissions: { grants: [] },
      },
      access_token_expires_at: "2026-11-06T12:00:00Z",
    })
    expect(
      queryClient.getQueryState(authSessionQueryOptions.queryKey)?.isInvalidated
    ).toBe(false)

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

    expect(
      queryClient.getQueryState(authSessionQueryOptions.queryKey)?.isInvalidated
    ).toBe(true)
    expect(vi.mocked(changeOwnPassword).mock.calls[0][0]).toEqual({
      current_password: "old-password",
      new_password: "new-password",
    })
  })
})
