import { Badge } from "@workspace/ui/components/badge"
import type { Row } from "@tanstack/react-table"
import type { SyncChange } from "@/features/proxmox-sync/api/proxmox-sync-api"

export function KindBadge({ kind }: { kind: SyncChange["kind"] }) {
  if (kind === "add") {
    return (
      <Badge className="bg-emerald-600/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
        Add
      </Badge>
    )
  }
  if (kind === "remove") {
    return <Badge className="bg-destructive/10 text-destructive">Remove</Badge>
  }
  return (
    <Badge className="bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">
      Update
    </Badge>
  )
}

export function DetailsCell({ row }: { row: Row<SyncChange> }) {
  const change = row.original

  if (change.kind === "update" && change.fields && change.fields.length > 0) {
    return (
      <div className="flex flex-col gap-0.5">
        {change.fields.map((f) => (
          <span key={f.field} className="text-xs text-muted-foreground">
            <span className="font-medium">{f.field}</span>:{" "}
            <span className="line-through opacity-60">{f.from}</span>{" "}
            <span>→ {f.to}</span>
          </span>
        ))}
      </div>
    )
  }

  if (
    change.kind === "remove" &&
    change.blockers &&
    change.blockers.length > 0
  ) {
    return (
      <div className="flex flex-col gap-0.5">
        {change.blockers.map((blocker) => (
          <span
            key={`${change.id}:${blocker}`}
            className="text-xs text-destructive"
          >
            {blocker}
          </span>
        ))}
      </div>
    )
  }

  return null
}
