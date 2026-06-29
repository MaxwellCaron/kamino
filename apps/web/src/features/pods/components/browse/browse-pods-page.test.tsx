import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { BrowsePodsPage } from "./browse-pods-page"
import { renderWithQueryClient } from "@/test/test-utils"

vi.mock("@/features/pods/api/publish-pod-api", () => ({
  podCatalogQueryOptions: {
    queryKey: ["pods", "catalog"],
    queryFn: () => Promise.reject(new Error("Server error")),
  },
}))

vi.mock("./browse-pods-card", () => ({
  BrowsePodsCard: () => null,
}))

vi.mock("./browse-pods-skeleton", () => ({
  BrowsePodsGridSkeleton: () => null,
  browsePodsGridClassName: "",
}))

vi.mock("@/components/grainient-background", () => ({
  GrainientBackground: () => null,
}))

describe("BrowsePodsPage", () => {
  it("renders error alert instead of No Pods when query fails", async () => {
    renderWithQueryClient(<BrowsePodsPage />)

    expect(await screen.findByText(/Server error/)).toBeInTheDocument()
    expect(screen.queryByText("No Pods")).not.toBeInTheDocument()
  })
})
