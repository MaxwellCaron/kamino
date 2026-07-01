import { Calendar04Icon, SparklesIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Badge } from "@workspace/ui/components/badge"
import { RELEASES } from "../utils/changelogs"

const TONE_BG: Record<string, string> = {
  emerald:
    "bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-400/20",
  indigo:
    "bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 dark:bg-indigo-400/20",
  amber:
    "bg-amber-600/20 text-amber-600 dark:text-amber-400 dark:bg-amber-400/20",
  rose: "bg-rose-600/20 text-rose-600 dark:text-rose-400 dark:bg-rose-400/20",
}

export function ChangelogPage() {
  return (
    <div className="min-h-svh bg-background px-10 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Changelog</div>
            <h1 className="mt-1 font-heading text-4xl font-extrabold tracking-tight text-balance">
              What's new in Kamino
            </h1>
          </div>
        </div>

        <div className="mt-10 flex flex-col">
          {RELEASES.map((r) => (
            <article
              key={r.date}
              className="grid grid-cols-[140px_1fr] gap-8 border-b border-border py-10 last:border-b-0"
            >
              <aside className="sticky top-8 self-start">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Calendar04Icon} className="size-4" />
                  {r.date}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {r.highlight ? (
                    <Badge>
                      <HugeiconsIcon icon={SparklesIcon} />
                      Latest
                    </Badge>
                  ) : null}
                </div>
              </aside>

              <div>
                {r.groups.map((g) => (
                  <div key={g.tag} className="mt-5 first:mt-0">
                    <Badge className={TONE_BG[g.tone]}>{g.tag}</Badge>
                    <ul className="mt-2 space-y-1.5">
                      {g.items.map((it) => (
                        <li
                          key={it}
                          className="flex gap-2 text-sm leading-relaxed text-foreground/85"
                        >
                          <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                          {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
