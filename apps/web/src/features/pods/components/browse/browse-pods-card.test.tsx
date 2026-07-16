import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrowsePodsCard } from "./browse-pods-card"
import type { Pod } from "@/features/pods/types/pod-types"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to: _to,
    params: _params,
    ...props
  }: {
    children?: React.ReactNode
    to?: string
    params?: Record<string, string>
  }) => (
    <a href="#" {...props}>
      {children}
    </a>
  ),
}))

const pod: Pod = {
  id: "pod-1",
  title: "Test Pod",
  slug: "test-pod",
  description: "A test pod description.",
  image: "/pod.png",
  creators: [],
  created_at: "2026-01-01T00:00:00Z",
  clone_count: 3,
  status: "listed",
  audience: [],
}

describe("BrowsePodsCard", () => {
  it("renders the cloned pin and accessible name when hasClonedInstance is true", () => {
    render(<BrowsePodsCard pod={pod} hasClonedInstance={true} />)

    expect(screen.getByText("Cloned")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Open Test Pod, cloned" })
    ).toBeInTheDocument()
  })

  it("omits the cloned pin and accessible name suffix when hasClonedInstance is false", () => {
    render(<BrowsePodsCard pod={pod} hasClonedInstance={false} />)

    expect(screen.queryByText("Cloned")).not.toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Open Test Pod" })
    ).toBeInTheDocument()
  })
})
