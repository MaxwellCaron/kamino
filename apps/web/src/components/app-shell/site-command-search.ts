import type { SiteCommandResult } from "./site-command-index"

function normalizeCommandSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function getCommandSearchText(command: SiteCommandResult) {
  return normalizeCommandSearchText(
    [command.label, command.subtitle, ...command.keywords].join(" ")
  )
}

export function commandMatchesQuery(command: SiteCommandResult, query: string) {
  const tokens = normalizeCommandSearchText(query).split(/\s+/).filter(Boolean)

  if (tokens.length === 0) {
    return true
  }

  const haystack = getCommandSearchText(command)
  return tokens.every((token) => haystack.includes(token))
}
