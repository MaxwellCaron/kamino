import { slugify } from "@workspace/ui/lib/utils"

export type DocsTocItem = {
  level: 2 | 3 | 4
  text: string
  anchor: string
}

const TOC_INDENT_BY_LEVEL: Record<DocsTocItem["level"], string> = {
  2: "",
  3: "pl-4",
  4: "pl-8",
}

export function getDocsTocIndentClass(level: DocsTocItem["level"]) {
  return TOC_INDENT_BY_LEVEL[level]
}

// Heading text must be plain (no links/bold/code) so this anchor matches the
// id rehypeSlugHeadings assigns to the rendered heading.
export function extractDocsToc(raw: string): Array<DocsTocItem> {
  const items: Array<DocsTocItem> = []
  let inCodeFence = false
  for (const line of raw.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) continue
    const match = /^(#{2,4})\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    const text = match[2].trim()
    items.push({
      level: match[1].length as DocsTocItem["level"],
      text,
      anchor: slugify(text),
    })
  }
  return items
}
