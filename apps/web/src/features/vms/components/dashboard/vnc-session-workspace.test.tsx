import { QueryClientProvider } from "@tanstack/react-query"
import { act, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useEffect } from "react"

import { VncSessionWorkspace } from "./vnc-session-workspace"
import { VncSessionVisibilityProvider, useIsVncSessionPinned } from "./vnc-session-visibility-context"
import type { VncConnectionStatus } from "./vnc-console"
import type {
  ApiInventoryItem,
  ApiTreeNode,
} from "@/features/inventory/types/inventory-types"
import { InventoryPermissionBits } from "@/features/inventory/utils/inventory-permissions"
import { createTestQueryClient, renderWithQueryClient } from "@/test/test-utils"

const {
  mockItemId,
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

function PinnedItemMarker({ itemId }: { itemId: string }) {
  const isPinned = useIsVncSessionPinned(itemId)
  return (
    <div data-testid={`pinned-marker-${itemId}`} data-pinned={isPinned ? "true" : "false"} />
  )
}

function renderWorkspace(options: { markerItemId?: string } = {}) {
  const queryClient = createTestQueryClient()
  const view = renderWithQueryClient(
    <VncSessionVisibilityProvider>
      <VncSessionWorkspace />
      {options.markerItemId ? (
        <PinnedItemMarker itemId={options.markerItemId} />
      ) : null}
    </VncSessionVisibilityProvider>,
    queryClient
  )

  return {
    ...view,
    rerenderWorkspace: (markerItemId = options.markerItemId) =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <VncSessionVisibilityProvider>
            <VncSessionWorkspace />
            {markerItemId ? <PinnedItemMarker itemId={markerItemId} /> : null}
          </VncSessionVisibilityProvider>
        </QueryClientProvider>
      ),
  }
}

function setRoute(itemId: string | undefined) {
  mockItemId.current = itemId
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

  it("stages the workspace offscreen without unmounting A on docs routes", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    setRoute(undefined)
    rerenderWorkspace()

    expect(screen.getByTestId("console-vm-a")).toBeInTheDocument()

    const workspace = screen.getByTestId("vnc-session-workspace")
    expect(workspace).not.toHaveAttribute("hidden")
    expect(workspace.className).toContain("fixed")
    expect(workspace.className).toContain("inset-0")
    expect(workspace.className).toContain("invisible")
    expect(workspace.className).toContain("pointer-events-none")
    expect(workspace).toHaveAttribute("aria-hidden", "true")
    expect(workspace).toHaveAttribute("inert")
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

  it("marks inactive panels invisible, inert, and aria-hidden without display:none", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    setRoute("vm-b")
    rerenderWorkspace()

    const inactivePanel = screen.getByTestId("vnc-panel-vm-a")
    expect(consoleMounts.current.get("vm-a")).toBe(1)
    expect(inactivePanel).not.toHaveAttribute("hidden")
    expect(inactivePanel.className).toContain("invisible")
    expect(inactivePanel.className).toContain("pointer-events-none")
    expect(inactivePanel.className).toContain("col-start-1")
    expect(inactivePanel.className).toContain("row-start-1")
    expect(inactivePanel).toHaveAttribute("aria-hidden", "true")
    expect(inactivePanel).toHaveAttribute("inert")
  })

  it("overlaps active and inactive panels in one grid cell", () => {
    const { rerenderWorkspace } = renderWorkspace()
    setConsoleStatus("vm-a", "connected")

    setRoute("vm-b")
    rerenderWorkspace()
    setConsoleStatus("vm-b", "connected")

    const workspace = screen.getByTestId("vnc-session-workspace")
    expect(workspace.className).toContain("grid")

    const panelA = screen.getByTestId("vnc-panel-vm-a")
    const panelB = screen.getByTestId("vnc-panel-vm-b")
    expect(panelA.className).toContain("col-start-1")
    expect(panelA.className).toContain("row-start-1")
    expect(panelB.className).toContain("col-start-1")
    expect(panelB.className).toContain("row-start-1")
    expect(panelA.parentElement).toBe(workspace)
    expect(panelB.parentElement).toBe(workspace)
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

  describe("pinned viewport placement", () => {
    it("pins the workspace when the active console is connected", () => {
      renderWorkspace()
      setConsoleStatus("vm-a", "connected")

      const workspace = screen.getByTestId("vnc-session-workspace")
      expect(workspace).toHaveAttribute("data-pinned", "true")
      expect(workspace.className).toContain("absolute")
      expect(workspace.className).toContain("inset-x-0")
      expect(workspace.className).toContain("bg-background")
    })

    it("pins the workspace for an expired active console", () => {
      renderWorkspace()
      setConsoleStatus("vm-a", "expired")

      const workspace = screen.getByTestId("vnc-session-workspace")
      expect(workspace).toHaveAttribute("data-pinned", "true")
    })

    it("pins the workspace while the active console is connecting", () => {
      renderWorkspace()
      setConsoleStatus("vm-a", "connecting")

      const workspace = screen.getByTestId("vnc-session-workspace")
      expect(workspace).toHaveAttribute("data-pinned", "true")
      expect(workspace.className).toContain("absolute")
    })

    it("keeps a disconnected destination inline in document flow", () => {
      const { rerenderWorkspace } = renderWorkspace()

      setRoute("vm-b")
      rerenderWorkspace()

      const workspace = screen.getByTestId("vnc-session-workspace")
      expect(workspace).toHaveAttribute("data-pinned", "false")
      expect(workspace.className).not.toContain("absolute")
    })

    it("stays pinned when switching between retained connected consoles", () => {
      const { rerenderWorkspace } = renderWorkspace()
      setConsoleStatus("vm-a", "connected")

      setRoute("vm-b")
      rerenderWorkspace()
      setConsoleStatus("vm-b", "connected")

      const workspace = screen.getByTestId("vnc-session-workspace")
      expect(workspace).toHaveAttribute("data-pinned", "true")

      setRoute("vm-a")
      rerenderWorkspace()

      expect(workspace).toHaveAttribute("data-pinned", "true")
    })

    it("returns to inline flow after disconnecting the active console", () => {
      const { rerenderWorkspace } = renderWorkspace()
      setConsoleStatus("vm-a", "connected")

      setConsoleStatus("vm-a", "disconnected")
      rerenderWorkspace()

      const workspace = screen.getByTestId("vnc-session-workspace")
      expect(workspace).toHaveAttribute("data-pinned", "false")
      expect(workspace.className).not.toContain("absolute")
    })

  })

  describe("pinned visibility context", () => {
    it("publishes no item when the active console is disconnected or inline", () => {
      const { rerenderWorkspace } = renderWorkspace({ markerItemId: "vm-a" })

      expect(screen.getByTestId("pinned-marker-vm-a")).toHaveAttribute(
        "data-pinned",
        "false"
      )

      setRoute("vm-b")
      rerenderWorkspace("vm-a")
      expect(screen.getByTestId("pinned-marker-vm-a")).toHaveAttribute(
        "data-pinned",
        "false"
      )
    })

    it.each(["connecting", "connected", "expired"] as const)(
      "publishes vm-a while the active console is %s",
      (status) => {
        renderWorkspace({ markerItemId: "vm-a" })
        setConsoleStatus("vm-a", status)

        expect(screen.getByTestId("pinned-marker-vm-a")).toHaveAttribute(
          "data-pinned",
          "true"
        )
      }
    )

    it("clears the published item when disconnecting", () => {
      const { rerenderWorkspace } = renderWorkspace({ markerItemId: "vm-a" })
      setConsoleStatus("vm-a", "connected")
      expect(screen.getByTestId("pinned-marker-vm-a")).toHaveAttribute(
        "data-pinned",
        "true"
      )

      setConsoleStatus("vm-a", "disconnected")
      rerenderWorkspace("vm-a")
      expect(screen.getByTestId("pinned-marker-vm-a")).toHaveAttribute(
        "data-pinned",
        "false"
      )
    })

    it("publishes only the active route item when switching retained consoles", () => {
      const { rerenderWorkspace } = renderWorkspace({ markerItemId: "vm-a" })
      setConsoleStatus("vm-a", "connected")

      setRoute("vm-b")
      rerenderWorkspace("vm-b")
      setConsoleStatus("vm-b", "connected")

      expect(screen.getByTestId("pinned-marker-vm-b")).toHaveAttribute(
        "data-pinned",
        "true"
      )

      setRoute("vm-a")
      rerenderWorkspace("vm-a")

      expect(screen.getByTestId("pinned-marker-vm-a")).toHaveAttribute(
        "data-pinned",
        "true"
      )
    })

    it("clears published state on unmount without warnings", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      const { unmount } = renderWorkspace({ markerItemId: "vm-a" })
      setConsoleStatus("vm-a", "connected")
      expect(screen.getByTestId("pinned-marker-vm-a")).toHaveAttribute(
        "data-pinned",
        "true"
      )

      unmount()

      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })
  })
})
