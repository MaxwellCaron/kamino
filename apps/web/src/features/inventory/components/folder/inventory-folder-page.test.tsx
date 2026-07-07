import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { InventoryFolderPage } from "./inventory-folder-page"
import type { ApiTreeNode } from "../../types/inventory-types"
import { renderWithQueryClient } from "@/test/test-utils"

const { mockInventoryTreeQueryFn, mockInventoryNodeMenuProps } = vi.hoisted(
  () => ({
    mockInventoryTreeQueryFn: vi.fn(),
    mockInventoryNodeMenuProps: {
      current: null as {
        itemId: string
        data: ApiTreeNode
        iconSize?: string
        contentAlign?: string
      } | null,
    },
  })
)

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useParams: () => ({ itemId: "folder-1" }),
  }),
  notFound: () => {
    throw new Error("NOT_FOUND")
  },
}))

vi.mock("@/features/inventory/api/inventory-api", () => ({
  inventoryTreeQueryOptions: {
    queryKey: ["inventory", "tree"],
    queryFn: mockInventoryTreeQueryFn,
  },
}))

vi.mock("../inventory-actions", () => ({
  InventoryNodeMenu: (props: {
    itemId: string
    data: ApiTreeNode
    iconSize?: string
    contentAlign?: string
  }) => {
    mockInventoryNodeMenuProps.current = props
    return (
      <button type="button" aria-label={`Actions for ${props.data.name}`}>
        Actions
      </button>
    )
  },
}))

vi.mock("./inventory-folder-contents", () => ({
  InventoryFolderContents: () => null,
}))

vi.mock("./inventory-folder-skeleton", () => ({
  InventoryFolderSkeleton: () => null,
}))

const testFolder: ApiTreeNode = {
  id: "folder-1",
  name: "Test Folder",
  kind: "folder",
  permissions: {
    allowed_mask: 0,
    denied_mask: 0,
    request_mask: 0,
  },
  children: [],
}

describe("InventoryFolderPage", () => {
  beforeEach(() => {
    mockInventoryTreeQueryFn.mockReset()
    mockInventoryNodeMenuProps.current = null
  })

  it("renders error alert instead of not found when tree query fails", async () => {
    mockInventoryTreeQueryFn.mockRejectedValue(new Error("Connection failed"))

    renderWithQueryClient(<InventoryFolderPage />)

    expect(await screen.findByText(/Connection failed/)).toBeInTheDocument()
  })

  it("renders folder heading and passes folder data to the action menu", async () => {
    mockInventoryTreeQueryFn.mockResolvedValue([testFolder])

    renderWithQueryClient(<InventoryFolderPage />)

    expect(
      await screen.findByRole("heading", { name: "Test Folder" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Actions for Test Folder" })
    ).toBeInTheDocument()
    expect(mockInventoryNodeMenuProps.current).toEqual({
      itemId: "folder-1",
      data: testFolder,
      iconSize: "icon",
      contentAlign: "end",
    })
  })
})
