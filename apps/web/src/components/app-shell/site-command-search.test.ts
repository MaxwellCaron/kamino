import {
  buildCommandSearchIndex,
  commandMatchesQuery,
  filterIndexedCommands,
  tokenizeCommandQuery,
} from "./site-command-search"
import { describe, expect, it } from "vitest"

import { Home03Icon } from "@hugeicons/core-free-icons"
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

describe("command search", () => {
  const commands = [
    makeCommand({ id: "a", label: "Alpha Server", keywords: ["prod"] }),
    makeCommand({ id: "b", label: "Beta Database", subtitle: "staging" }),
    makeCommand({ id: "c", label: "Gamma Cache" }),
  ]
  const index = buildCommandSearchIndex(commands)

  it.each([
    ["alpha", ["a"]],
    ["staging", ["b"]],
    ["prod", ["a"]],
  ])("finds commands through label, subtitle, or keyword: %s", (query, ids) => {
    expect(
      filterIndexedCommands(index, tokenizeCommandQuery(query)).map((c) => c.id)
    ).toEqual(ids)
  })

  it("requires every query token even when they match different fields", () => {
    expect(
      filterIndexedCommands(index, tokenizeCommandQuery("beta staging")).map(
        (c) => c.id
      )
    ).toEqual(["b"])
    expect(
      filterIndexedCommands(index, tokenizeCommandQuery("beta missing"))
    ).toEqual([])
  })

  it("ignores repeated whitespace and returns all commands for an empty query", () => {
    expect(
      filterIndexedCommands(
        index,
        tokenizeCommandQuery("  alpha   prod  ")
      ).map((c) => c.id)
    ).toEqual(["a"])
    expect(filterIndexedCommands(index, tokenizeCommandQuery("  "))).toEqual(
      commands
    )
  })

  it("matches mixed-case accented queries and labels", () => {
    const accented = buildCommandSearchIndex([
      makeCommand({ id: "cafe", label: "Café Résumé" }),
      makeCommand({ id: "plain", label: "Resume Builder" }),
    ])
    expect(
      filterIndexedCommands(accented, tokenizeCommandQuery("RÉSUMÉ")).map(
        (c) => c.id
      )
    ).toEqual(["cafe", "plain"])
    expect(
      filterIndexedCommands(accented, tokenizeCommandQuery("CAFE resume")).map(
        (c) => c.id
      )
    ).toEqual(["cafe"])
  })

  it("can reuse an index after successful and unsuccessful searches", () => {
    expect(
      filterIndexedCommands(index, tokenizeCommandQuery("alpha")).map(
        (c) => c.id
      )
    ).toEqual(["a"])
    expect(
      filterIndexedCommands(index, tokenizeCommandQuery("missing token"))
    ).toEqual([])
    expect(
      filterIndexedCommands(index, tokenizeCommandQuery("beta")).map(
        (c) => c.id
      )
    ).toEqual(["b"])
    expect(filterIndexedCommands(index, [])).toEqual(commands)
  })
})

describe("commandMatchesQuery", () => {
  it("searches a single command across all fields", () => {
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
