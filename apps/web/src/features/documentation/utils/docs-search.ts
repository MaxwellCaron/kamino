import { slugify } from "@workspace/ui/lib/utils"
import userGuide from "@/features/documentation/content/user-guide.md?raw"
import managerGuide from "@/features/documentation/content/manager-guide.md?raw"
import adminGuide from "@/features/documentation/content/admin-guide.md?raw"

export type DocsSection = {
  docKey: "user" | "manager" | "admin"
  docTitle: string
  route: "/docs" | "/manager/docs" | "/admin/docs"
  heading: string
  anchor: string
  bodyText: string
}

export type DocsSearchMatch = {
  docKey: DocsSection["docKey"]
  docTitle: string
  route: DocsSection["route"]
  heading: string
  anchor: string
  preview: string
}

export type DocsSearchAccess = {
  canManage: boolean
  canAdminister: boolean
}

function normalize(value: string) {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

function stripMarkdownLine(line: string) {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/__([^_]*)__/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/_([^_]*)_/g, "$1")
}

function isTableSeparatorRow(line: string) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line)
}

function parseGuide(
  raw: string,
  docKey: DocsSection["docKey"],
  route: DocsSection["route"]
): Array<DocsSection> {
  const lines = raw.split("\n")
  let docTitle = ""
  const sections: Array<DocsSection> = []
  let current: { heading: string; anchor: string; bodyLines: Array<string> } | null =
    null

  const flush = () => {
    if (current) {
      sections.push({
        docKey,
        docTitle,
        route,
        heading: current.heading,
        anchor: current.anchor,
        bodyText: current.bodyLines.join("\n"),
      })
    }
    current = null
  }

  for (const line of lines) {
    if (!docTitle && /^#\s+/.test(line)) {
      docTitle = line.replace(/^#\s+/, "").trim()
      continue
    }

    const h2Match = /^##\s+(.+)$/.exec(line)
    if (h2Match) {
      flush()
      const heading = h2Match[1].trim()
      current = { heading, anchor: slugify(heading), bodyLines: [] }
      continue
    }

    if (/^#\s+/.test(line)) {
      // Additional h1 lines are ignored from bodies.
      continue
    }

    if (current) {
      const strippedHeadingMarkers = line.replace(/^#{3,6}\s+/, "")
      current.bodyLines.push(strippedHeadingMarkers)
    }
  }

  flush()

  return sections
}

const userSections = parseGuide(userGuide, "user", "/docs")
const managerSections = parseGuide(managerGuide, "manager", "/manager/docs")
const adminSections = parseGuide(adminGuide, "admin", "/admin/docs")

function buildPreview(section: DocsSection, tokens: Array<string>) {
  const strippedLines = section.bodyText
    .split("\n")
    .map(stripMarkdownLine)
    .filter((line) => !isTableSeparatorRow(line))
    .filter((line) => line.trim().length > 0)

  const matchIndex = strippedLines.findIndex((line) => {
    const normalizedLine = normalize(line)
    return tokens.some((token) => normalizedLine.includes(token))
  })

  const start = matchIndex >= 0 ? Math.max(0, matchIndex - 1) : 0
  return strippedLines.slice(start, start + 5).join("\n")
}

// anchor must match slugify used by rehypeSlugHeadings in
// packages/ui/src/components/markdown-content.tsx
export function searchDocs(
  query: string,
  access: DocsSearchAccess
): Array<DocsSearchMatch> {
  const tokens = normalize(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return []
  }

  const availableSections: Array<DocsSection> = [...userSections]
  if (access.canManage) {
    availableSections.push(...managerSections)
  }
  if (access.canAdminister) {
    availableSections.push(...adminSections)
  }

  const matches: Array<DocsSearchMatch> = []

  for (const section of availableSections) {
    const haystack = normalize(
      `${section.docTitle} ${section.heading} ${section.bodyText}`
    )
    const matchesAllTokens = tokens.every((token) => haystack.includes(token))
    if (!matchesAllTokens) continue

    matches.push({
      docKey: section.docKey,
      docTitle: section.docTitle,
      route: section.route,
      heading: section.heading,
      anchor: section.anchor,
      preview: buildPreview(section, tokens),
    })

    if (matches.length >= 8) {
      break
    }
  }

  return matches
}
