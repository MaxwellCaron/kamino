import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { usePublishedPodsBulkConfirm } from "./use-published-pods-bulk-confirm"
import {
  showSingleMutationToast,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"

vi.mock("@/components/feedback/mutation-progress-toast", () => ({
  showSingleMutationToast: vi.fn(),
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
  it("uses one pod-named toast and bulk request for start without fetching clones", async () => {
    const queryClient = new QueryClient()
    queryClient.fetchQuery = vi.fn()

    const bulkCloneActionMutation = {
      mutateAsync: vi
        .fn()
        .mockResolvedValueOnce({
          succeeded: ["clone-1"],
          failed: [{ id: "clone-2", error: "internal clone failure" }],
        })
        .mockResolvedValueOnce({
          succeeded: ["clone-1", "clone-2"],
          failed: [],
        }),
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

    expect(queryClient.fetchQuery).not.toHaveBeenCalled()
    expect(showSingleMutationToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Starting",
        name: "Lab Pod",
      })
    )

    const params = vi.mocked(showSingleMutationToast).mock.calls[0][0]
    const serialized = JSON.stringify(params)
    expect(serialized).not.toContain("clone-1")
    expect(serialized).not.toContain("clone-2")
    expect(serialized).not.toContain("Alice")
    expect(serialized).not.toContain("internal clone failure")

    const runBulkPower = params.promise as () => Promise<unknown>
    await expect(runBulkPower()).rejects.toThrow("Pod did not fully start.")
    expect(bulkCloneActionMutation.mutateAsync).toHaveBeenCalledWith({
      pod,
      action: "start",
    })

    await expect(runBulkPower()).resolves.toBeUndefined()
    expect(bulkCloneActionMutation.mutateAsync).toHaveBeenCalledTimes(2)
  })

  it("keeps delete as per-clone progress", async () => {
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

    const { result } = renderHook(
      () =>
        usePublishedPodsBulkConfirm({
          pendingCloneBulkAction: { pod, action: "delete" },
          bulkCloneActionMutation: { mutateAsync: vi.fn() } as never,
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
    expect(config.units).toHaveLength(2)
    expect(config.units[0].items[0].name).toBe("Alice")
    expect(config.units[1].items[0].name).toBe("Bob")
  })
})
