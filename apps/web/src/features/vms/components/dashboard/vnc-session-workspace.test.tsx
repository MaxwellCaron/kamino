import { QueryClientProvider } from "@tanstack/react-query"
import { act, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useEffect } from "react"

import { VncSessionWorkspace } from "./vnc-session-workspace"
import type { VncConnectionStatus } from "./vnc-console"
import type {
  ApiInventoryItem,
  ApiTreeNode,
} from "@/features/inventory/types/inventory-types"
import { InventoryPermissionBits } from "@/features/inventory/utils/inventory-permissions"
import { createTestQueryClient, renderWithQueryClient } from "@/test/test-utils"

const {
  mockItemId,
  mockHref,
  mockGetItemData,
  mockGetStatus,
  mockTreeLoading,
  mockTreeError,
  mockFallbackItems,
  mockDocumentVisibility,
  consoleMounts,
  statusHandlers,
} = vi.hoisted(() => {
  function current<T>(value: T) {
    return { current: value }
  }

  return {
    mockItemId: current<string | undefined>("vm-a"),
    mockHref: current("/inventory/items/vm-a"),
    mockGetItemData: vi.fn(),
    mockGetStatus: vi.fn(),
    mockTreeLoading: current(false),
    mockTreeError: current<Error | null>(null),
    mockFallbackItems: current(new Map<string, ApiInventoryItem>()),
    mockDocumentVisibility: current<DocumentVisibilityState>("visible"),
    consoleMounts: current(new Map<string, number>()),
    statusHandlers: current(
      new Map<string, (status: VncConnectionStatus) => void>()
    ),
  }
})

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ itemId: mockItemId.current }),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { href: string } }) => string
  }) => select({ location: { href: mockHref.current } }),
}))

vi.mock("@/features/inventory/components/tree/inventory-tree-context", () => ({
  useInventoryTreeContext: () => ({
    getItemData: mockGetItemData,
    getStatus: mockGetStatus,
    isLoading: mockTreeLoading.current,
    error: mockTreeError.current,
  }),
}))

vi.mock("@/features/inventory/api/inventory-api", () => ({
  inventoryItemQueryOptions: (itemId: string) => ({
    queryKey: ["inventory", "item", itemId],
    queryFn: () => {
      const item = mockFallbackItems.current.get(itemId)
      if (!item) {
        throw new Error("item not found")
      }
      return item
    },
    enabled: !!itemId,
  }),
}))

vi.mock("@/features/vms/api/vm-api", () => ({
  vmStatusQueryOptions: {
    queryKey: ["vm", "status"],
    queryFn: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("./vnc-console", () => ({
  VncConsole: ({
    itemId,
    isViewed,
    onStatusChange,
  }: {
    itemId: string
    isViewed: boolean
    onStatusChange: (status: VncConnectionStatus) => void
  }) => {
    useEffect(() => {
      const mounts = consoleMounts.current.get(itemId) ?? 0
      consoleMounts.current.set(itemId, mounts + 1)
    }, [itemId])

    useEffect(() => {
      statusHandlers.current.set(itemId, onStatusChange)
      return () => {
        if (statusHandlers.current.get(itemId) === onStatusChange) {
          statusHandlers.current.delete(itemId)
        }
      }
    }, [itemId, onStatusChange])

    return (
      <div
        data-testid={`console-${itemId}`}
        data-viewed={isViewed ? "true" : "false"}
      />
    )
  },
}))

function makeVmNode(
  id: string,
  name: string,
  options: {
    isTemplate?: boolean
    consoleAllowed?: boolean
  } = {}
): ApiTreeNode {
  const consoleAllowed = options.consoleAllowed ?? true
  return {
    id,
    name,
    kind: "vm",
    permissions: {
      allowed_mask: consoleAllowed ? InventoryPermissionBits.consoleVm : 0,
      denied_mask: 0,
      request_mask: 0,
    },
    vm: {
      node: "pve",
      vmid: id === "vm-a" ? 101 : 102,
      guest_type: "qemu",
      is_template: options.isTemplate ?? false,
    },
  }
}

function makeInventoryItem(node: ApiTreeNode): ApiInventoryItem {
  return {
    id: node.id,
    parent_id: null,
    kind: node.kind,
    name: node.name,
    description: node.description,
    inherit_permissions: true,
    permissions: node.permissions,
    vm: node.vm,
  }
}

function renderWorkspace() {
  const queryClient = createTestQueryClient()
  const view = renderWithQueryClient(<VncSessionWorkspace />, queryClient)

  return {
    ...view,
    rerenderWorkspace: () =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <VncSessionWorkspace />
        </QueryClientProvider>
      ),
  }
}

function setRoute(itemId: string | undefined, href?: string) {
  mockItemId.current = itemId
  mockHref.current = href ?? (itemId ? `/inventory/items/${itemId}` : "/docs")
}

function setConsoleStatus(itemId: string, status: VncConnectionStatus) {
  act(() => {
    statusHandlers.current.get(itemId)?.(status)
  })
}

describe("VncSessionWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockItemId.current = "vm-a"
    mockHref.current = "/inventory/items/vm-a"
    mockTreeLoading.current = false
    mockTreeError.current = null
    mockFallbackItems.current = new Map()
    mockDocumentVisibility.current = "visible"
    mockGetItemData.mockReset()
    mockGetStatus.mockReset()
    consoleMounts.current = new Map()
    statusHandlers.current = new Map()
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => mockDocumentVisibility.current
    )

    mockGetItemData.mockImplementation((id: string) => {
      if (id === "vm-a") return makeVmNode("vm-a", "VM A")
      if (id === "vm-b") return makeVmNode("vm-b", "VM B")
      if (id === "folder-1") {
        return {
          id: "folder-1",
          name: "Folder",
          kind: "folder",
          permissions: {
            allowed_mask: 0,
            denied_mask: 0,
            request_mask: 0,
          },
        }
      }
      return undefined
    })
    mockGetStatus.mockImplementation((id: string) =>
      id === "vm-a" || id === "vm-b" ? "running" : undefined
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("keeps connected A mounted and hidden when routing to disconnected B", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    setRoute("vm-b")
    rerenderWorkspace()

    expect(consoleMounts.current.get("vm-a")).toBe(1)
    expect(screen.getByTestId("console-vm-a")).toHaveAttribute(
      "data-viewed",
      "false"
    )
    expect(screen.getByTestId("console-vm-b")).toHaveAttribute(
      "data-viewed",
      "true"
    )
  })

  it("retains connecting B when routing back to A before it settles", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    setRoute("vm-b")
    rerenderWorkspace()
    setConsoleStatus("vm-b", "connecting")

    setRoute("vm-a")
    rerenderWorkspace()

    expect(screen.getByTestId("console-vm-b")).toBeInTheDocument()
    expect(consoleMounts.current.get("vm-b")).toBe(1)
  })

  it("returns to the original keyed A instance while B stays mounted", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    setRoute("vm-b")
    rerenderWorkspace()
    setConsoleStatus("vm-b", "connected")

    setRoute("vm-a")
    rerenderWorkspace()

    expect(consoleMounts.current.get("vm-a")).toBe(1)
    expect(consoleMounts.current.get("vm-b")).toBe(1)
    expect(screen.getByTestId("console-vm-a")).toHaveAttribute(
      "data-viewed",
      "true"
    )
  })

  it("keeps an expired session state mounted without affecting another console", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    setRoute("vm-b")
    rerenderWorkspace()
    setConsoleStatus("vm-b", "connected")

    setRoute("vm-a")
    rerenderWorkspace()
    setConsoleStatus("vm-b", "expired")

    expect(screen.getByTestId("console-vm-a")).toBeInTheDocument()
    expect(screen.getByTestId("console-vm-b")).toBeInTheDocument()
    expect(consoleMounts.current.get("vm-b")).toBe(1)
  })

  it("unmounts only B when the hidden session disconnects", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    setRoute("vm-b")
    rerenderWorkspace()
    setConsoleStatus("vm-b", "connected")

    setRoute("vm-a")
    rerenderWorkspace()
    setConsoleStatus("vm-b", "disconnected")

    rerenderWorkspace()

    expect(screen.getByTestId("console-vm-a")).toBeInTheDocument()
    expect(screen.queryByTestId("console-vm-b")).not.toBeInTheDocument()
  })

  it("hides the workspace without unmounting A on docs routes", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    setRoute(undefined, "/docs")
    rerenderWorkspace()

    expect(screen.getByTestId("console-vm-a")).toBeInTheDocument()
    expect(screen.getByTestId("vnc-panel-vm-a")).toHaveAttribute("hidden")
    expect(screen.getByTestId("vnc-panel-vm-a").parentElement).toHaveAttribute(
      "hidden"
    )
  })

  it("does not render consoles for templates, folders, or missing items", () => {
    mockGetItemData.mockImplementation((id: string) => {
      if (id === "vm-a") {
        return makeVmNode("vm-a", "VM A", { isTemplate: true })
      }
      if (id === "folder-1") {
        return {
          id: "folder-1",
          name: "Folder",
          kind: "folder",
          permissions: {
            allowed_mask: 0,
            denied_mask: 0,
            request_mask: 0,
          },
        }
      }
      return undefined
    })

    setRoute("vm-a")
    const { unmount } = renderWorkspace()
    expect(screen.queryByTestId("console-vm-a")).not.toBeInTheDocument()
    unmount()

    setRoute("folder-1")
    renderWorkspace()
    expect(screen.queryByTestId("console-folder-1")).not.toBeInTheDocument()

    setRoute("missing")
    renderWorkspace()
    expect(screen.queryByTestId("console-missing")).not.toBeInTheDocument()
  })

  it("does not render consoles without direct console permission", () => {
    mockGetItemData.mockImplementation(() =>
      makeVmNode("vm-a", "VM A", { consoleAllowed: false })
    )

    renderWorkspace()
    expect(screen.queryByTestId("console-vm-a")).not.toBeInTheDocument()
  })

  it("retains a valid direct-item fallback session across navigation", async () => {
    mockFallbackItems.current.set(
      "vm-fallback",
      makeInventoryItem(makeVmNode("vm-fallback", "Fallback VM"))
    )
    setRoute("vm-fallback")

    const { rerenderWorkspace } = renderWorkspace()
    await screen.findByTestId("console-vm-fallback")
    setConsoleStatus("vm-fallback", "connected")

    setRoute("vm-b")
    rerenderWorkspace()

    expect(screen.getByTestId("console-vm-fallback")).toBeInTheDocument()
    expect(consoleMounts.current.get("vm-fallback")).toBe(1)
  })

  it("removes retained sessions after permission is revoked on a successful tree refresh", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")
    expect(screen.getByTestId("console-vm-a")).toBeInTheDocument()

    mockGetItemData.mockImplementation(() =>
      makeVmNode("vm-a", "VM A", { consoleAllowed: false })
    )
    rerenderWorkspace()

    expect(screen.queryByTestId("console-vm-a")).not.toBeInTheDocument()
  })

  it("does not prune retained sessions while the tree is in an error state", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    mockGetItemData.mockImplementation(() =>
      makeVmNode("vm-a", "VM A", { consoleAllowed: false })
    )
    mockTreeError.current = new Error("tree failed")
    rerenderWorkspace()

    expect(screen.getByTestId("console-vm-a")).toBeInTheDocument()
  })

  it("marks inactive panels hidden, inert, and aria-hidden", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    setRoute("vm-b")
    rerenderWorkspace()

    const hiddenPanel = screen.getByTestId("vnc-panel-vm-a")
    expect(hiddenPanel).toHaveAttribute("hidden")
    expect(hiddenPanel).toHaveAttribute("aria-hidden", "true")
    expect(hiddenPanel).toHaveAttribute("inert")
  })

  it("marks the active console unviewed while the browser tab is hidden", () => {
    renderWorkspace()
    expect(screen.getByTestId("console-vm-a")).toHaveAttribute(
      "data-viewed",
      "true"
    )

    mockDocumentVisibility.current = "hidden"
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })

    expect(screen.getByTestId("console-vm-a")).toHaveAttribute(
      "data-viewed",
      "false"
    )
  })

  describe("scroll centering", () => {
    let rafCallback: FrameRequestCallback | null = null
    const scrollIntoView = vi.fn()

    beforeEach(() => {
      rafCallback = null
      scrollIntoView.mockReset()
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        rafCallback = cb
        return 1
      })
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
        rafCallback = null
      })
      Element.prototype.scrollIntoView = scrollIntoView
    })

    function flushScrollFrame() {
      act(() => {
        rafCallback?.(0)
        rafCallback = null
      })
    }

    it("does not center when routing to a disconnected destination", () => {
      const { rerenderWorkspace } = renderWorkspace()
      setConsoleStatus("vm-a", "connected")

      setRoute("vm-b")
      rerenderWorkspace()
      flushScrollFrame()

      expect(scrollIntoView).not.toHaveBeenCalled()
    })

    it("centers once when returning to a connected destination", () => {
      const { rerenderWorkspace } = renderWorkspace()
      setConsoleStatus("vm-a", "connected")

      setRoute("vm-b")
      rerenderWorkspace()
      setConsoleStatus("vm-b", "connected")

      setRoute("vm-a")
      rerenderWorkspace()
      flushScrollFrame()

      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "center",
        behavior: "auto",
      })
    })

    it("centers on the first successful connection", () => {
      renderWorkspace()
      setConsoleStatus("vm-a", "connected")
      flushScrollFrame()

      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    })

    it("centers an expired destination so the timeout reason is visible", () => {
      const { rerenderWorkspace } = renderWorkspace()
      setConsoleStatus("vm-a", "expired")

      setRoute("vm-b")
      rerenderWorkspace()
      setRoute("vm-a")
      rerenderWorkspace()
      flushScrollFrame()

      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    })

    it("does not repeatedly scroll on same-route status or power rerenders", () => {
      const { rerenderWorkspace } = renderWorkspace()
      setConsoleStatus("vm-a", "connected")
      flushScrollFrame()
      scrollIntoView.mockClear()

      mockGetStatus.mockReturnValue("stopped")
      rerenderWorkspace()
      flushScrollFrame()

      expect(scrollIntoView).not.toHaveBeenCalled()
    })

    it("does not move focus to the console panel", () => {
      const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
      renderWorkspace()
      setConsoleStatus("vm-a", "connected")
      flushScrollFrame()

      expect(focusSpy).not.toHaveBeenCalled()
      focusSpy.mockRestore()
    })
  })
})
