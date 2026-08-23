import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { InventoryPermissionBits } from "../../utils/inventory-permissions"
import { InventoryTreeProvider } from "./inventory-tree-provider"
import { useInventoryTreeViewContext } from "./inventory-tree-context"
import type { ApiTreeNode } from "../../types/inventory-types"

const folder: ApiTreeNode = {
  id: "folder-1",
  name: "Folder",
  kind: "folder",
  permissions: {
    allowed_mask: InventoryPermissionBits.view,
    denied_mask: 0,
    request_mask: 0,
  },
}

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}))

vi.mock("../../hooks/use-inventory-favorites", () => ({
  useInventoryFavorites: () => ({
    favoriteIds: new Set<string>(),
    toggleFavorite: vi.fn(),
  }),
}))

vi.mock("../../hooks/use-inventory-actions", () => ({
  useMoveInventoryItems: () => ({ mutateAsync: vi.fn() }),
}))

function ExpansionConsumer() {
  const { tree, expandedItemIds, expandAll, collapseAll } =
    useInventoryTreeViewContext()

  return (
    <>
      <output data-testid="expanded-items">{expandedItemIds.join(",")}</output>
      <button
        type="button"
        onClick={() => {
          const item = tree.getItemInstance(folder.id)
          if (item.isExpanded()) item.collapse()
          else item.expand()
        }}
      >
        Toggle folder
      </button>
      <button type="button" onClick={expandAll}>
        Expand all
      </button>
      <button type="button" onClick={collapseAll}>
        Collapse all
      </button>
    </>
  )
}

function renderInventoryTree() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
    },
  })
  queryClient.setQueryData(["inventory", "tree"], [folder])
  queryClient.setQueryData(["vms", "status"], {})

  render(
    <QueryClientProvider client={queryClient}>
      <InventoryTreeProvider>
        <ExpansionConsumer />
      </InventoryTreeProvider>
    </QueryClientProvider>
  )
}

describe("inventory tree expansion", () => {
  beforeEach(() => localStorage.clear())

  it("publishes folder expansion changes to view consumers immediately", async () => {
    renderInventoryTree()

    const expandedItems = screen.getByTestId("expanded-items")
    await waitFor(() => expect(expandedItems).toHaveTextContent(folder.id))

    fireEvent.click(screen.getByRole("button", { name: "Toggle folder" }))
    await waitFor(() =>
      expect(expandedItems).not.toHaveTextContent(folder.id)
    )

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }))
    await waitFor(() => expect(expandedItems).toHaveTextContent(folder.id))

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }))
    await waitFor(() => expect(expandedItems).toBeEmptyDOMElement())
  })
})
