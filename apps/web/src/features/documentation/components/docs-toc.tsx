import { Link } from "@tanstack/react-router"
import { cn } from "@workspace/ui/lib/utils"
import type { DocsTocItem } from "@/features/documentation/utils/docs-toc"
import { getDocsTocIndentClass } from "@/features/documentation/utils/docs-toc"

export function DocsToc({ items }: { items: Array<DocsTocItem> }) {
  if (items.length === 0) return null

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-2 font-medium text-foreground">On This Page</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.anchor}
            className={cn("min-w-0", getDocsTocIndentClass(item.level))}
          >
            <Link
              to="."
              hash={item.anchor}
              resetScroll={false}
              className="block truncate text-muted-foreground transition-colors hover:text-foreground"
              title={item.text}
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
