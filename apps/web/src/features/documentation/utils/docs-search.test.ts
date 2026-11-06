import { describe, expect, it } from "vitest"
import { searchDocs } from "./docs-search"

const noAccess = { canManage: false, canAdminister: false }
const managerAccess = { canManage: true, canAdminister: false }
const adminAccess = { canManage: true, canAdminister: true }

describe("searchDocs", () => {
  it("returns no matches for an empty query", () => {
    expect(searchDocs("", noAccess)).toEqual([])
    expect(searchDocs("   ", adminAccess)).toEqual([])
  })

  it("matches a token that exists only in body text", () => {
    const matches = searchDocs("re-clone", noAccess)
    expect(matches.length).toBeGreaterThan(0)
    const match = matches.find((m) => m.heading === "Cloning pods")
    expect(match).toBeDefined()
    expect(match?.preview.toLowerCase()).toContain("re-clone")
  })

  it("gates manager guide sections behind canManage", () => {
    const withoutManager = searchDocs("publish", noAccess)
    expect(withoutManager.some((m) => m.docKey === "manager")).toBe(false)

    const withManager = searchDocs("publish", managerAccess)
    expect(withManager.some((m) => m.docKey === "manager")).toBe(true)
  })

  it("gates admin guide sections behind canAdminister", () => {
    const withoutAdmin = searchDocs("proxmox sync", managerAccess)
    expect(withoutAdmin.some((m) => m.docKey === "admin")).toBe(false)

    const withAdmin = searchDocs("proxmox sync", adminAccess)
    expect(withAdmin.some((m) => m.docKey === "admin")).toBe(true)
  })

  it("never leaks manager or admin content to a user without access", () => {
    const managerPhraseResults = searchDocs("bulk clone", noAccess)
    expect(managerPhraseResults).toEqual([])

    const adminPhraseResults = searchDocs("protected bootstrap", noAccess)
    expect(adminPhraseResults).toEqual([])

    expect(searchDocs("bulk clone", managerAccess).length).toBeGreaterThan(0)
    expect(
      searchDocs("protected bootstrap", adminAccess).length
    ).toBeGreaterThan(0)
  })

  it("never leaks admin content to a manager without admin access", () => {
    const adminPhraseResults = searchDocs("protected bootstrap", managerAccess)
    expect(adminPhraseResults).toEqual([])
    expect(
      searchDocs("protected bootstrap", adminAccess).length
    ).toBeGreaterThan(0)
  })

  it("applies union semantics: manager sees user + manager content", () => {
    const managerResults = searchDocs("publish", managerAccess)
    expect(managerResults.some((m) => m.docKey === "manager")).toBe(true)

    const podResults = searchDocs("pod", managerAccess)
    expect(podResults.some((m) => m.docKey === "user")).toBe(true)
  })

  it("caps preview length at 5 lines", () => {
    const matches = searchDocs("pod", adminAccess)
    expect(matches.length).toBeGreaterThan(0)
    for (const match of matches) {
      const lineCount = match.preview.split("\n").filter(Boolean).length
      expect(lineCount).toBeLessThanOrEqual(5)
    }
  })

  it("links matching sections to their heading anchors", () => {
    const matches = searchDocs("Finding things", noAccess)
    const match = matches.find((m) => m.heading === "Finding things")
    expect(match).toBeDefined()
    expect(match?.anchor).toBe("finding-things")
    expect(match?.route).toBe("/docs")
  })

  it("caps total results at 8", () => {
    const matches = searchDocs("a", adminAccess)
    expect(matches).toHaveLength(8)
  })
})
