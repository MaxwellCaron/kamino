import { act, fireEvent, render } from "@testing-library/react"
import { createContext, use, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import type { ApiTreeNode } from "../../../lib/inventory/inventory-types"
import { InventoryTreeContent } from "./tree-content"
import type { RefObject } from "react"
import { useInventoryHeadlessTree } from "../../../hooks/inventory/tree/use-inventory-headless-tree"

const scrollToIndex = vi.hoisted(() => vi.fn())
const ViewContext = createContext<{
  scrollToItemHandlerRef: RefObject<((itemId: string) => void) | null>
} | null>(null)

vi.mock("@/hooks/inventory/tree/use-inventory-tree-context", () => ({
  useInventoryTreeDataContext: () => ({ canPowerByFolderId: new Map() }),
  useInventoryTreeNavigationContext: () => ({ handlePrimaryAction: vi.fn() }),
  useInventoryTreeViewContext: () => ({
    ...use(ViewContext),
    favoriteIds: new Set(),
    toggleFavorite: vi.fn(),
  }),
}))
vi.mock(
  "../../../hooks/inventory/tree/use-inventory-tree-drag-autoscroll",
  () => ({
    useInventoryTreeDragAutoscroll: vi.fn(),
  })
)
vi.mock("@workspace/ui/components/reui/tree", () => ({
  Tree: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TreeDragLine: () => null,
}))
vi.mock("@tanstack/react-virtual", () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: (options: {
    getScrollElement: () => HTMLElement | null
    count: number
  }) => ({
    scrollElement: options.getScrollElement(),
    scrollOffset: 0,
    scrollRect: { height: 200 },
    getOffsetForIndex: (index: number) => [index * 40],
    getVirtualItems: () => [],
    getTotalSize: () => options.count * 40,
    scrollToIndex,
  }),
}))

const permissions = { allowed_mask: 0, denied_mask: 0, request_mask: 0 }
const items = new Map<string, ApiTreeNode>([
  ["root", { id: "root", name: "Root", kind: "folder", permissions }],
  ["folder", { id: "folder", name: "Folder", kind: "folder", permissions }],
  ["vm", { id: "vm", name: "VM", kind: "vm", permissions }],
])
const children = new Map([
  ["root", ["folder"]],
  ["folder", ["vm"]],
])
const parentIds = new Map([
  ["folder", "root"],
  ["vm", "folder"],
])

function Harness() {
  const [selectedItemIds, setSelectedItemIds] = useState<Array<string>>([])
  const { tree, revealItem, scrollToItemHandlerRef } = useInventoryHeadlessTree(
    {
      items,
      children,
      parentIds,
      folderIds: ["folder"],
      selectedItemIds,
      setSelectedItemIds,
      onMove: vi.fn(),
      onPrimaryAction: vi.fn(),
    }
  )
  return (
    <ViewContext value={{ scrollToItemHandlerRef }}>
      <button onClick={() => void revealItem("vm")}>Reveal nested VM</button>
      <div data-slot="tree-scroll-container">
        <InventoryTreeContent tree={tree} getStatus={() => undefined} />
      </div>
    </ViewContext>
  )
}

describe("inventory reveal", () => {
  it("scrolls to a nested VM after expanding its parent without waiting on a timer", async () => {
    localStorage.setItem("kamino-inventory-expanded:v1", "[]")
    vi.useFakeTimers()
    try {
      const screen = render(<Harness />)
      await act(async () => {
        fireEvent.click(screen.getByText("Reveal nested VM"))
        await Promise.resolve()
      })
      expect(scrollToIndex).toHaveBeenCalledWith(1, {
        align: "auto",
        behavior: "smooth",
      })
      await act(async () => {
        fireEvent.click(screen.getByText("Reveal nested VM"))
        await Promise.resolve()
      })
      expect(scrollToIndex).toHaveBeenCalledTimes(2)
      screen.unmount()
    } finally {
      vi.useRealTimers()
      localStorage.clear()
    }
  })
})
