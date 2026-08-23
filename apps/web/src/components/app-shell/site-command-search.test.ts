import { Home03Icon } from "@hugeicons/core-free-icons"
import { describe, expect, it } from "vitest"

import {
  buildCommandSearchIndex,
  commandMatchesQuery,
  filterIndexedCommands,
  indexedCommandMatchesTokens,
  normalizeCommandSearchText,
  tokenizeCommandQuery,
} from "./site-command-search"
import type { SiteCommandResult } from "./site-command-index"

function makeCommand(
  overrides: Partial<SiteCommandResult> = {}
): SiteCommandResult {
  return {
    id: "test",
    label: "Test",
    subtitle: "",
    keywords: [],
    group: "pages",
    icon: Home03Icon,
    onSelect: () => {},
    ...overrides,
  }
}

describe("normalizeCommandSearchText", () => {
  it("strips diacritics and lowercases", () => {
    expect(normalizeCommandSearchText("Café Résumé")).toBe("cafe resume")
  })
})

describe("tokenizeCommandQuery", () => {
  it("splits on whitespace and ignores empty tokens", () => {
    expect(tokenizeCommandQuery("  foo   bar  ")).toEqual(["foo", "bar"])
  })

  it("normalizes accents in query tokens", () => {
    expect(tokenizeCommandQuery("café résumé")).toEqual(["cafe", "resume"])
  })
})

describe("buildCommandSearchIndex", () => {
  it("indexes label, subtitle, and keywords", () => {
    const index = buildCommandSearchIndex([
      makeCommand({
        label: "VM Console",
        subtitle: "Open remote desktop",
        keywords: ["vnc", "terminal"],
      }),
    ])

    expect(index[0]?.searchText).toBe(
      "vm console open remote desktop vnc terminal"
    )
  })
})

describe("indexedCommandMatchesTokens", () => {
  it("matches all tokens against the haystack", () => {
    const indexed = {
      command: makeCommand({ label: "Production VM" }),
      searchText: "production vm staging",
    }

    expect(indexedCommandMatchesTokens(indexed, ["prod", "vm"])).toBe(true)
    expect(indexedCommandMatchesTokens(indexed, ["prod", "missing"])).toBe(
      false
    )
  })

  it("returns true for empty token lists", () => {
    const indexed = {
      command: makeCommand(),
      searchText: "anything",
    }

    expect(indexedCommandMatchesTokens(indexed, [])).toBe(true)
  })
})

describe("filterIndexedCommands", () => {
  const commands = [
    makeCommand({ id: "a", label: "Alpha Server", keywords: ["prod"] }),
    makeCommand({ id: "b", label: "Beta Database", subtitle: "staging" }),
    makeCommand({ id: "c", label: "Gamma Cache" }),
  ]
  const index = buildCommandSearchIndex(commands)

  it("filters by multiple tokens", () => {
    expect(filterIndexedCommands(index, ["beta", "staging"]).map((c) => c.id)).toEqual(
      ["b"]
    )
  })

  it("matches accents in query against plain labels", () => {
    const accented = buildCommandSearchIndex([
      makeCommand({ id: "d", label: "Resume Builder" }),
    ])

    expect(
      filterIndexedCommands(accented, tokenizeCommandQuery("résumé")).map(
        (c) => c.id
      )
    ).toEqual(["d"])
  })
})

describe("commandMatchesQuery", () => {
  it("preserves legacy matching semantics", () => {
    const command = makeCommand({
      label: "User Settings",
      subtitle: "Manage profile",
      keywords: ["account"],
    })

    expect(commandMatchesQuery(command, "profile account")).toBe(true)
    expect(commandMatchesQuery(command, "missing")).toBe(false)
    expect(commandMatchesQuery(command, "")).toBe(true)
  })
})

describe("buildCommandSearchIndex reuse", () => {
  it("keeps haystacks stable while filtering with different queries", () => {
    const index = buildCommandSearchIndex([
      makeCommand({ id: "1", label: "Alpha" }),
      makeCommand({ id: "2", label: "Beta" }),
    ])
    const originalTexts = index.map((entry) => entry.searchText)

    filterIndexedCommands(index, tokenizeCommandQuery("alpha"))
    filterIndexedCommands(index, tokenizeCommandQuery("beta test"))
    filterIndexedCommands(index, tokenizeCommandQuery("missing token"))

    expect(index.map((entry) => entry.searchText)).toEqual(originalTexts)
  })
})
