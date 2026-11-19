import type { SiteCommandResult } from "./site-command-index"

export function normalizeCommandSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

export type IndexedSiteCommand = {
  command: SiteCommandResult
  searchText: string
}

export function buildCommandSearchIndex(
  commands: Array<SiteCommandResult>
): Array<IndexedSiteCommand> {
  return commands.map((command) => ({
    command,
    searchText: normalizeCommandSearchText(
      [command.label, command.subtitle, ...command.keywords].join(" ")
    ),
  }))
}

export function tokenizeCommandQuery(query: string): Array<string> {
  return normalizeCommandSearchText(query).split(/\s+/).filter(Boolean)
}

export function indexedCommandMatchesTokens(
  indexed: IndexedSiteCommand,
  tokens: Array<string>
) {
  if (tokens.length === 0) {
    return true
  }

  return tokens.every((token) => indexed.searchText.includes(token))
}

export function filterIndexedCommands(
  index: Array<IndexedSiteCommand>,
  tokens: Array<string>
) {
  const results: Array<SiteCommandResult> = []

  for (const indexed of index) {
    if (indexedCommandMatchesTokens(indexed, tokens)) {
      results.push(indexed.command)
    }
  }

  return results
}

export function commandMatchesQuery(command: SiteCommandResult, query: string) {
  const tokens = tokenizeCommandQuery(query)
  const searchText = normalizeCommandSearchText(
    [command.label, command.subtitle, ...command.keywords].join(" ")
  )
  return indexedCommandMatchesTokens({ command, searchText }, tokens)
}
