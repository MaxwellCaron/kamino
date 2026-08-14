import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { InventoryPermissionBits } from "../../utils/inventory-permissions"
import {
  useInventoryTreeDataContext,
  useInventoryTreeNavigationContext,
  useInventoryTreeViewContext,
} from "./inventory-tree-context"
import { InventoryTreeProvider } from "./inventory-tree-provider"
import type { ApiTreeNode } from "../../types/inventory-types"

const renders = vi.hoisted(() => ({
  data: 0,
  view: 0,
  navigation: 0,
}))

const mockState = vi.hoisted(() => ({
  apiTree: [] as Array<ApiTreeNode>,
  vmStatuses: {} satisfies Record<number, string>,
  favorites: {
    favoriteIds: new Set<string>(),
    toggleFavorite: vi.fn(),
  },
  headlessTree: {
    tree: {
      getItems: () => [],
      getState: () => ({ focusedItem: null }),
      applySubStateUpdate: vi.fn(),
      rebuildTree: vi.fn(),
    },
    expandedItemIds: [] as Array<string>,
    expandAll: vi.fn(),
    collapseAll: vi.fn(),
    revealItem: vi.fn().mockResolvedValue(undefined),
    scrollToItemHandlerRef: { current: null },
  },
}))

function vmNode(id: string, name: string, vmid: number): ApiTreeNode {
  return {
    id,
    name,
    kind: "vm",
    permissions: {
      allowed_mask: InventoryPermissionBits.view,
      denied_mask: 0,
      request_mask: 0,
    },
    vm: { node: "pve", vmid, guest_type: "qemu", is_template: false },
  }
}

function DataConsumer() {
  useInventoryTreeDataContext()
  useEffect(() => {
    renders.data += 1
  })
  return <div data-testid="data-consumer" />
}

function ViewConsumer() {
  const { setSearchQuery } = useInventoryTreeViewContext()
  useEffect(() => {
    renders.view += 1
  })
  return (
    <button type="button" onClick={() => setSearchQuery("alpha query")}>
      Search
    </button>
  )
}

function NavigationConsumer() {
  useInventoryTreeNavigationContext()
  useEffect(() => {
    renders.navigation += 1
  })
  return <div data-testid="navigation-consumer" />
}

function Harness() {
  return (
    <>
      <DataConsumer />
      <ViewConsumer />
      <NavigationConsumer />
    </>
  )
}

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}))

vi.mock("../../hooks/use-inventory-headless-tree", () => ({
  useInventoryHeadlessTree: () => mockState.headlessTree,
}))

vi.mock("../../hooks/use-inventory-favorites", () => ({
  useInventoryFavorites: () => mockState.favorites,
}))

vi.mock("../../hooks/use-inventory-actions", () => ({
  useMoveInventoryItems: () => ({
    mutateAsync: vi.fn(),
  }),
}))

function createProviderTree(apiTree: Array<ApiTreeNode>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: Infinity,
      },
    },
  })

  queryClient.setQueryData(["inventory", "tree"], apiTree)
  queryClient.setQueryData(["vms", "status"], mockState.vmStatuses)

  return {
    queryClient,
    view: (
      <QueryClientProvider client={queryClient}>
        <InventoryTreeProvider>
          <Harness />
        </InventoryTreeProvider>
      </QueryClientProvider>
    ),
  }
}

describe("InventoryTreeProvider context isolation", () => {
  beforeEach(() => {
    renders.data = 0
    renders.view = 0
    renders.navigation = 0
    mockState.apiTree = [vmNode("vm-1", "Alpha", 101)]
    mockState.vmStatuses = { 101: "running" }
  })

  it("does not rerender data or navigation consumers when search changes", async () => {
    const { view } = createProviderTree(mockState.apiTree)
    const { getByRole } = render(view)

    await waitFor(() => {
      expect(renders.data).toBeGreaterThan(0)
      expect(renders.view).toBeGreaterThan(0)
      expect(renders.navigation).toBeGreaterThan(0)
    })

    const dataAfterMount = renders.data
    const viewAfterMount = renders.view
    const navigationAfterMount = renders.navigation

    await act(() => {
      fireEvent.click(getByRole("button", { name: "Search" }))
    })

    await waitFor(() => {
      expect(renders.view).toBeGreaterThan(viewAfterMount)
    })

    expect(renders.data).toBe(dataAfterMount)
    expect(renders.navigation).toBe(navigationAfterMount)
  })

  it("does not rerender view or navigation consumers when vm status changes", async () => {
    const { queryClient, view } = createProviderTree(mockState.apiTree)
    render(view)

    await waitFor(() => {
      expect(renders.data).toBeGreaterThan(0)
      expect(renders.view).toBeGreaterThan(0)
      expect(renders.navigation).toBeGreaterThan(0)
    })

    const viewAfterMount = renders.view
    const navigationAfterMount = renders.navigation
    const dataAfterMount = renders.data

    act(() => {
      mockState.vmStatuses = { 101: "stopped" }
      queryClient.setQueryData(["vms", "status"], mockState.vmStatuses)
    })

    await waitFor(() => {
      expect(renders.data).toBeGreaterThan(dataAfterMount)
    })

    expect(renders.view).toBe(viewAfterMount)
    expect(renders.navigation).toBe(navigationAfterMount)
  })
})
