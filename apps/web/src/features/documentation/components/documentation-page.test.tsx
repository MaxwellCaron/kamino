import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { DocumentationPage } from "./documentation-page"
import { renderWithQueryClient } from "@/test/test-utils"

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "",
  Link: ({
    children,
    hash,
    to: _to,
    resetScroll: _resetScroll,
    ...props
  }: {
    children?: React.ReactNode
    hash?: string
    to?: string
    resetScroll?: boolean
  }) => (
    <a href={hash ? `#${hash}` : undefined} {...props}>
      {children}
    </a>
  ),
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

  it("renders an On this page navigation with section links", () => {
    renderWithQueryClient(
      <DocumentationPage
        content={"# T\n\n## Alpha\n\n### Beta\n\n#### Gamma\n\nbody"}
      />
    )

    const nav = screen.getByRole("navigation", { name: "On this page" })
    expect(nav).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "T" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      "#alpha"
    )
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute(
      "href",
      "#beta"
    )
    expect(screen.getByRole("link", { name: "Gamma" })).toHaveAttribute(
      "href",
      "#gamma"
    )
  })

  it("renders no On this page navigation when content has only an h1", () => {
    renderWithQueryClient(<DocumentationPage content={"# T only\n\nbody"} />)

    expect(
      screen.queryByRole("navigation", { name: "On this page" })
    ).not.toBeInTheDocument()
  })

  it("renders no On this page navigation when content has no headings", () => {
    renderWithQueryClient(
      <DocumentationPage content={"Body text without any headings."} />
    )

    expect(
      screen.queryByRole("navigation", { name: "On this page" })
    ).not.toBeInTheDocument()
  })
})
