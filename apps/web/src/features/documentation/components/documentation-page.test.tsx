import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { DocumentationPage } from "./documentation-page"
import { renderWithQueryClient } from "@/test/test-utils"

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "",
}))

describe("DocumentationPage", () => {
  it("renders headings and paragraphs from markdown content", () => {
    renderWithQueryClient(
      <DocumentationPage content={"# T\n\n## Sub section\n\nbody"} />
    )

    expect(
      screen.getByRole("heading", { level: 1, name: "T" })
    ).toBeInTheDocument()
    expect(screen.getByText("body")).toBeInTheDocument()
  })

  it("assigns a slugged id to rendered headings", () => {
    renderWithQueryClient(
      <DocumentationPage content={"# T\n\n## Sub section\n\nbody"} />
    )

    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Sub section",
    })
    expect(heading).toHaveAttribute("id", "sub-section")
  })
})
