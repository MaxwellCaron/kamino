import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { BrowsePodsPage } from "./browse-pods-page"
import type { Pod } from "@/features/pods/types/pod-types"
import type { CatalogCloneSummary } from "@/features/pods/api/clone-pod-api"
import { renderWithQueryClient } from "@/test/test-utils"

const { mockCatalogQueryFn, mockCloneSummariesQueryFn } = vi.hoisted(() => ({
  mockCatalogQueryFn: vi.fn(),
  mockCloneSummariesQueryFn: vi.fn(),
}))

vi.mock("@/features/pods/api/publish-pod-api", () => ({
  podCatalogQueryOptions: {
    queryKey: ["pods", "catalog"],
    queryFn: mockCatalogQueryFn,
  },
}))

vi.mock("@/features/pods/api/clone-pod-api", () => ({
  catalogCloneSummariesQueryOptions: () => ({
    queryKey: ["pods", "catalog", "clones", "summary"],
    queryFn: mockCloneSummariesQueryFn,
  }),
}))

vi.mock("./browse-pods-card", () => ({
  BrowsePodsCard: ({
    pod,
    hasClonedInstance,
  }: {
    pod: Pod
    hasClonedInstance: boolean
  }) => (
    <div
      data-testid={`browse-pod-card-${pod.id}`}
      data-has-cloned={String(hasClonedInstance)}
    />
  ),
}))

vi.mock("./browse-pods-skeleton", () => ({
  BrowsePodsGridSkeleton: () => <div aria-label="Loading pods" />,
  browsePodsGridClassName: "",
}))

vi.mock("@/components/grainient-background", () => ({
  GrainientBackground: () => null,
}))

function makePod(id: string, title: string): Pod {
  return {
    id,
    title,
    slug: id,
    description: `${title} description`,
    image: "/pod.png",
    creators: [],
    created_at: "2026-01-01T00:00:00Z",
    clone_count: 1,
    status: "listed",
    audience: [],
  }
}

function makeSummary(
  podId: string,
  status: CatalogCloneSummary["summary"]["status"]
): CatalogCloneSummary {
  return {
    summary: {
      id: `clone-${podId}`,
      pod_id: podId,
      cloned_at: "2026-01-01T00:00:00Z",
      status,
      task_summary: { total: 1, completed: 1, progress: 100 },
    },
    pod: {
      id: podId,
      slug: podId,
      title: podId,
      description: "summary pod",
      image_url: "/pod.png",
    },
  }
}

describe("BrowsePodsPage", () => {
  beforeEach(() => {
    mockCatalogQueryFn.mockReset()
    mockCloneSummariesQueryFn.mockReset()
    mockCloneSummariesQueryFn.mockResolvedValue([])
  })

  it("renders error alert instead of No Pods when query fails", async () => {
    mockCatalogQueryFn.mockRejectedValue(new Error("Server error"))

    renderWithQueryClient(<BrowsePodsPage />)

    expect(await screen.findByText(/Server error/)).toBeInTheDocument()
    expect(screen.queryByText("No Pods")).not.toBeInTheDocument()
  })

  it("passes hasClonedInstance from clone summaries regardless of power state", async () => {
    const pods = [
      makePod("pod-running", "Running Pod"),
      makePod("pod-stopped", "Stopped Pod"),
      makePod("pod-partial", "Partial Pod"),
      makePod("pod-uncloned", "Uncloned Pod"),
    ]
    mockCatalogQueryFn.mockResolvedValue(pods)
    mockCloneSummariesQueryFn.mockResolvedValue([
      makeSummary("pod-running", "running"),
      makeSummary("pod-stopped", "stopped"),
      makeSummary("pod-partial", "partial"),
    ])

    renderWithQueryClient(<BrowsePodsPage />)

    expect(await screen.findByTestId("browse-pod-card-pod-running")).toHaveAttribute(
      "data-has-cloned",
      "true"
    )
    expect(screen.getByTestId("browse-pod-card-pod-stopped")).toHaveAttribute(
      "data-has-cloned",
      "true"
    )
    expect(screen.getByTestId("browse-pod-card-pod-partial")).toHaveAttribute(
      "data-has-cloned",
      "true"
    )
    expect(screen.getByTestId("browse-pod-card-pod-uncloned")).toHaveAttribute(
      "data-has-cloned",
      "false"
    )
  })

  it("shows the loading skeleton while clone summaries are initially loading", async () => {
    mockCatalogQueryFn.mockResolvedValue([makePod("pod-1", "Pod One")])
    mockCloneSummariesQueryFn.mockReturnValue(new Promise(() => {}))

    renderWithQueryClient(<BrowsePodsPage />)

    expect(await screen.findByLabelText("Loading pods")).toBeInTheDocument()
    expect(screen.queryByTestId("browse-pod-card-pod-1")).not.toBeInTheDocument()
  })

  it("renders clone-summary errors instead of published cards or the empty state", async () => {
    mockCatalogQueryFn.mockResolvedValue([makePod("pod-1", "Pod One")])
    mockCloneSummariesQueryFn.mockRejectedValue(
      new Error("Clone summary unavailable")
    )

    renderWithQueryClient(<BrowsePodsPage />)

    expect(
      await screen.findByText(/Clone summary unavailable/)
    ).toBeInTheDocument()
    expect(screen.queryByTestId("browse-pod-card-pod-1")).not.toBeInTheDocument()
    expect(screen.queryByText("No Pods")).not.toBeInTheDocument()
  })
})
