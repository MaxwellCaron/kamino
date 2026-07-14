import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { usePublishedPodsBulkConfirm } from "./use-published-pods-bulk-confirm"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"

vi.mock("@/components/feedback/mutation-progress-toast", () => ({
  showUnitMutationToast: vi.fn(),
}))

const pod = {
  id: "pod-1",
  title: "Lab Pod",
  slug: "lab",
  description: "",
  image: "",
  creators: [],
  created_at: "2026-01-01T00:00:00Z",
  clone_count: 2,
  status: "listed" as const,
  audience: [],
  source_folder: "folder-1",
  virtual_machines: [],
}

describe("usePublishedPodsBulkConfirm", () => {
  it("uses one bulk unit with per-clone items for start", async () => {
    const queryClient = new QueryClient()
    queryClient.fetchQuery = vi.fn().mockResolvedValue([
      {
        id: "clone-1",
        owner: { id: "u1", type: "user", label: "Alice", description: "" },
      },
      {
        id: "clone-2",
        owner: { id: "u2", type: "user", label: "Bob", description: "" },
      },
    ])

    const bulkCloneActionMutation = {
      mutateAsync: vi.fn().mockResolvedValue({ succeeded: ["clone-1", "clone-2"], failed: [] }),
      isPending: false,
    }

    const { result } = renderHook(
      () =>
        usePublishedPodsBulkConfirm({
          pendingCloneBulkAction: { pod, action: "start" },
          bulkCloneActionMutation: bulkCloneActionMutation as never,
          deleteCloneMutation: { mutateAsync: vi.fn() } as never,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    )

    await result.current?.onConfirm()

    expect(showUnitMutationToast).toHaveBeenCalled()
    const config = vi.mocked(showUnitMutationToast).mock.calls[0][0]
    expect(config.units).toHaveLength(1)
    expect(config.units[0].items).toHaveLength(2)
    expect(config.units[0].items.map((item) => item.id)).toEqual([
      "clone-1",
      "clone-2",
    ])
  })
})
