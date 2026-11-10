import { describe, expect, it } from "vitest"
import { extractDocsToc } from "./docs-toc"

describe("extractDocsToc", () => {
  it("extracts h2 through h4 headings in document order with correct levels", () => {
    const raw = `# Title

## Alpha

### Beta

#### Gamma

## Delta
`
    const items = extractDocsToc(raw)
    expect(items).toEqual([
      { level: 2, text: "Alpha", anchor: "alpha" },
      { level: 3, text: "Beta", anchor: "beta" },
      { level: 4, text: "Gamma", anchor: "gamma" },
      { level: 2, text: "Delta", anchor: "delta" },
    ])
  })

  it("ignores h1 and h5+ headings", () => {
    const raw = `# Page title

## Section

##### Deep section

###### Deeper
`
    const items = extractDocsToc(raw)
    expect(items).toEqual([{ level: 2, text: "Section", anchor: "section" }])
  })

  it("ignores heading lines inside code fences", () => {
    const raw = `## Real section

\`\`\`md
# Fake heading
## Also fake
\`\`\`

## Another section
`
    const items = extractDocsToc(raw)
    expect(items).toEqual([
      { level: 2, text: "Real section", anchor: "real-section" },
      { level: 2, text: "Another section", anchor: "another-section" },
    ])
  })

  it("produces anchors consistent with the markdown renderer", () => {
    const items = extractDocsToc("## Sub section")
    expect(items[0]?.anchor).toBe("sub-section")
  })
})
