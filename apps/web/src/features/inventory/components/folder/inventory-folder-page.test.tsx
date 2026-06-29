import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { InventoryFolderPage } from "./inventory-folder-page"
import { renderWithQueryClient } from "@/test/test-utils"

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
    queryFn: () => Promise.reject(new Error("Connection failed")),
  },
}))

vi.mock("./inventory-folder-contents", () => ({
  InventoryFolderContents: () => null,
}))

vi.mock("./inventory-folder-skeleton", () => ({
  InventoryFolderSkeleton: () => null,
}))

describe("InventoryFolderPage", () => {
  it("renders error alert instead of not found when tree query fails", async () => {
    renderWithQueryClient(<InventoryFolderPage />)

    expect(await screen.findByText(/Connection failed/)).toBeInTheDocument()
  })
})
