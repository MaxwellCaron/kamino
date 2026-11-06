import type * as VmApiModule from "../api/vm-api"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  convertToTemplate,
  createSnapshot,
  deleteSnapshot,
  rollbackSnapshot,
  snapshotsQueryOptions,
} from "../api/vm-api"
import {
  useConvertToTemplate,
  useCreateSnapshot,
  useDeleteSnapshot,
  useRollbackSnapshot,
} from "./use-vm-actions"
import type { ReactNode } from "react"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"

vi.mock("../api/vm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof VmApiModule>()),
  convertToTemplate: vi.fn(),
  createSnapshot: vi.fn(),
  deleteSnapshot: vi.fn(),
  rollbackSnapshot: vi.fn(),
}))

afterEach(() => vi.useRealTimers())

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe("completed VM operations", () => {
  it.each([
    ["create snapshot", useCreateSnapshot, createSnapshot],
    ["delete snapshot", useDeleteSnapshot, deleteSnapshot],
    ["rollback snapshot", useRollbackSnapshot, rollbackSnapshot],
  ] as const)(
    "refreshes snapshots as soon as %s completes",
    async (_, useAction, action) => {
      vi.useFakeTimers()
      const client = new QueryClient({
        defaultOptions: { queries: { gcTime: Infinity } },
      })
      const key = snapshotsQueryOptions("vm-1").queryKey
      client.setQueryData(key, [])
      let complete!: () => void
      vi.mocked(action).mockReturnValue(
        new Promise<void>((resolve) => {
          complete = resolve
        })
      )
      const { result } = renderHook(() => useAction("vm-1"), {
        wrapper: wrapper(client),
      })
      let operation!: Promise<void>
      await act(async () => {
        operation = result.current.mutateAsync({
          itemId: "vm-1",
          snapname: "before-update",
        })
        await Promise.resolve()
      })
      expect(client.getQueryState(key)?.isInvalidated).toBe(false)
      await act(async () => {
        complete()
        await operation
      })
      expect(client.getQueryState(key)?.isInvalidated).toBe(true)
      client.clear()
    }
  )

  it("refreshes inventory immediately after conversion finishes", async () => {
    vi.useFakeTimers()
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity } },
    })
    client.setQueryData(inventoryTreeQueryOptions.queryKey, [])
    vi.mocked(convertToTemplate).mockResolvedValue({
      succeeded: ["vm-1"],
      failed: [],
    })
    const { result } = renderHook(useConvertToTemplate, {
      wrapper: wrapper(client),
    })
    await act(async () => {
      await result.current.mutateAsync({ itemIds: ["vm-1"] })
    })
    expect(
      client.getQueryState(inventoryTreeQueryOptions.queryKey)?.isInvalidated
    ).toBe(true)
    client.clear()
  })
})
