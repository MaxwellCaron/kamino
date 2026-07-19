import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "sonner"
import { usePublishedPodsBulkConfirm } from "./use-published-pods-bulk-confirm"
import type * as MutationProgressToastModule from "@/components/feedback/mutation-progress-toast"
import { powerPublishedPodClone, reclonePublishedPodClone } from "@/features/pods/api/publish-pod-api"
import {
  runMutationUnits,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"

vi.mock("@/components/feedback/mutation-progress-toast", async (importOriginal) => {
  const actual = await importOriginal<typeof MutationProgressToastModule>()
  return {
    ...actual,
    showUnitMutationToast: vi.fn(),
  }
})

vi.mock("@/features/pods/api/publish-pod-api", () => ({
  podCatalogQueryOptions: { queryKey: ["pods", "catalog"] },
  publishedPodClonesQueryOptions: (podId?: string) => ({
    queryKey: ["pods", "published", podId, "clones"],
    queryFn: vi.fn(),
    enabled: !!podId,
  }),
  publishedPodsQueryOptions: { queryKey: ["pods", "published"] },
  powerPublishedPodClone: vi.fn(),
  reclonePublishedPodClone: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
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

function makeClone(id: string, label: string, powerStatus?: string): never {
  return {
    id,
    pod_id: "pod-1",
    owner: { id: `u-${id}`, type: "user", label, description: "" },
    cloned_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    status: "running",
    network: {
      number: 1,
      vnet: "vnet1",
      external_subnet: "10.0.0.0/24",
      internal_subnet: "10.0.1.0/24",
      profile_key: "lan-router-v1",
    },
    vm_count: 1,
    task_summary: { total: 0, completed: 0, progress: 0 },
    power_result:
      powerStatus === undefined
        ? undefined
        : { action: "start", status: powerStatus },
  } as never
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

function renderBulkConfirm(
  action: "start" | "shutdown" | "reclone" | "delete",
  clones: Array<never>,
  deleteMutateAsync: ReturnType<typeof vi.fn> = vi.fn()
) {
  const queryClient = new QueryClient()
  queryClient.fetchQuery = vi.fn().mockResolvedValue(clones) as never
  queryClient.setQueryData = vi.fn() as never
  queryClient.invalidateQueries = vi.fn() as never

  const { result } = renderHook(
    () =>
      usePublishedPodsBulkConfirm({
        pendingCloneBulkAction: { pod, action },
        deleteCloneMutation: { mutateAsync: deleteMutateAsync } as never,
      }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    }
  )
  return { result, queryClient }
}

describe("usePublishedPodsBulkConfirm", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("start: one unit per clone, no concurrency override, item name is owner label", () => {
    const clones = [makeClone("clone-1", "Alice"), makeClone("clone-2", "Bob")]
    vi.mocked(powerPublishedPodClone).mockImplementation((params) =>
      Promise.resolve(makeClone(params.clonedPodId, params.action, "succeeded"))
    )

    const { result } = renderBulkConfirm("start", clones)

    return Promise.resolve(result.current!.onConfirm()).then(() => {
      expect(showUnitMutationToast).toHaveBeenCalledTimes(1)
      const config = vi.mocked(showUnitMutationToast).mock.calls[0][0]
      expect(config.concurrency).toBeUndefined()
      expect(config.units).toHaveLength(2)
      expect(config.units[0].items[0].name).toBe("Alice")
      expect(config.units[1].items[0].name).toBe("Bob")
      expect(config.units[0].items[0].successDescription).toBe("Started")
      expect(config.units[1].items[0].successDescription).toBe("Started")

      return Promise.all([
        config.units[0].run(() => {}),
        config.units[1].run(() => {}),
      ]).then(() => {
        expect(powerPublishedPodClone).toHaveBeenCalledWith({
          podId: "pod-1",
          clonedPodId: "clone-1",
          action: "start",
        })
        expect(powerPublishedPodClone).toHaveBeenCalledWith({
          podId: "pod-1",
          clonedPodId: "clone-2",
          action: "start",
        })
      })
    })
  })

  it("shutdown: one unit per clone with Shut down description", () => {
    const clones = [makeClone("clone-1", "Alice"), makeClone("clone-2", "Bob")]
    vi.mocked(powerPublishedPodClone).mockImplementation((params) =>
      Promise.resolve(makeClone(params.clonedPodId, params.action, "succeeded"))
    )

    const { result } = renderBulkConfirm("shutdown", clones)

    return Promise.resolve(result.current!.onConfirm()).then(() => {
      const config = vi.mocked(showUnitMutationToast).mock.calls[0][0]
      expect(config.concurrency).toBeUndefined()
      expect(config.units).toHaveLength(2)
      expect(config.units[0].items[0].name).toBe("Alice")
      expect(config.units[0].items[0].successDescription).toBe("Shut down")
      expect(config.units[1].items[0].name).toBe("Bob")

      return config.units[0].run(() => {}).then(() => {
        expect(powerPublishedPodClone).toHaveBeenCalledWith({
          podId: "pod-1",
          clonedPodId: "clone-1",
          action: "shutdown",
        })
      })
    })
  })

  it("reclone: one unit per clone with shared manager concurrency", () => {
    const clones = [makeClone("clone-1", "Alice"), makeClone("clone-2", "Bob")]
    vi.mocked(reclonePublishedPodClone).mockImplementation((params) =>
      Promise.resolve(makeClone(params.clonedPodId, "Re-cloned", "succeeded"))
    )

    const { result } = renderBulkConfirm("reclone", clones)

    return Promise.resolve(result.current!.onConfirm()).then(() => {
      const config = vi.mocked(showUnitMutationToast).mock.calls[0][0]
      expect(config.concurrency).toBe(5)
      expect(config.units).toHaveLength(2)
      expect(config.units[0].items[0].name).toBe("Alice")
      expect(config.units[1].items[0].name).toBe("Bob")
      expect(config.units[0].items[0].successDescription).toBe("Re-cloned")

      return Promise.all([
        config.units[0].run(() => {}),
        config.units[1].run(() => {}),
      ]).then(() => {
        expect(reclonePublishedPodClone).toHaveBeenCalledWith({
          podId: "pod-1",
          clonedPodId: "clone-1",
        })
        expect(reclonePublishedPodClone).toHaveBeenCalledWith({
          podId: "pod-1",
          clonedPodId: "clone-2",
        })
      })
    })
  })

  it("power: a clone whose power_result.status is not succeeded throws from run", () => {
    const clones = [makeClone("clone-1", "Alice")]
    vi.mocked(powerPublishedPodClone).mockResolvedValue(
      makeClone("clone-1", "Alice", "partial")
    )

    const { result } = renderBulkConfirm("start", clones)

    return Promise.resolve(result.current!.onConfirm()).then(() => {
      const config = vi.mocked(showUnitMutationToast).mock.calls[0][0]
      return expect(config.units[0].run(() => {})).rejects.toThrow(
        "Pod did not fully start."
      )
    })
  })

  it("delete: shared manager concurrency with backpressure and clone-specific retry", async () => {
    const cloneIds = Array.from({ length: 6 }, (_, index) => `clone-${index + 1}`)
    const clones = cloneIds.map((cloneId, index) =>
      makeClone(cloneId, `User ${index + 1}`)
    )
    const deferredByClone = new Map<string, ReturnType<typeof createDeferred<void>>>(
      cloneIds.map((cloneId) => [cloneId, createDeferred<void>()])
    )
    let activeRequests = 0
    let maxActiveRequests = 0
    const deleteMutateAsync = vi.fn(
      async ({ clonedPodId }: { podId: string; clonedPodId: string }) => {
        activeRequests += 1
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
        const deferred = deferredByClone.get(clonedPodId)
        if (!deferred) {
          throw new Error(`missing deferred for ${clonedPodId}`)
        }
        try {
          await deferred.promise
        } finally {
          activeRequests -= 1
        }
      }
    )

    const { result } = renderBulkConfirm("delete", clones, deleteMutateAsync)

    await result.current!.onConfirm()

    const config = vi.mocked(showUnitMutationToast).mock.calls[0][0]
    expect(config.concurrency).toBe(5)
    expect(config.units).toHaveLength(6)
    config.units.forEach((unit, index) => {
      expect(unit.items[0].name).toBe(`User ${index + 1}`)
      expect(unit.items[0].successDescription).toBe("Deleted")
    })

    const runPromise = runMutationUnits(config.units, () => {}, config.concurrency!)

    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledTimes(5)
    })
    expect(maxActiveRequests).toBe(5)
    expect(deleteMutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ clonedPodId: "clone-6" })
    )

    deferredByClone.get("clone-1")!.resolve()

    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledWith({
        podId: "pod-1",
        clonedPodId: "clone-6",
      })
    })
    expect(maxActiveRequests).toBeLessThanOrEqual(5)

    for (const cloneId of cloneIds.slice(1)) {
      deferredByClone.get(cloneId)!.resolve()
    }

    await expect(runPromise).resolves.toEqual({
      succeeded: cloneIds,
      failed: [],
    })
    expect(maxActiveRequests).toBeLessThanOrEqual(5)
    expect(deleteMutateAsync).toHaveBeenCalledTimes(6)
    for (const cloneId of cloneIds) {
      expect(deleteMutateAsync).toHaveBeenCalledWith({
        podId: "pod-1",
        clonedPodId: cloneId,
      })
    }

    const retryDeferred = createDeferred<void>()
    deleteMutateAsync.mockImplementationOnce(
      async ({ clonedPodId }: { podId: string; clonedPodId: string }) => {
        expect(clonedPodId).toBe("clone-2")
        await retryDeferred.promise
      }
    )

    const retryPromise = config.units[1].items[0].retry!()
    retryDeferred.resolve()
    await retryPromise
  })

  it("empty clones for start shows info toast without a mutation toast", () => {
    const { result } = renderBulkConfirm("start", [])

    return Promise.resolve(result.current!.onConfirm()).then(() => {
      expect(toast.info).toHaveBeenCalledWith("No clones to update.")
      expect(showUnitMutationToast).not.toHaveBeenCalled()
    })
  })

  it("empty clones for delete shows info toast without a mutation toast", () => {
    const { result } = renderBulkConfirm("delete", [])

    return Promise.resolve(result.current!.onConfirm()).then(() => {
      expect(toast.info).toHaveBeenCalledWith("No clones to delete.")
      expect(showUnitMutationToast).not.toHaveBeenCalled()
    })
  })
})
