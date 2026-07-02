import { Badge } from "@workspace/ui/components/badge"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import {
  formatAuditStatus,
  getAuditStatusClassName,
  presentAuditItemIdentity,
} from "../utils/audit-presenters"
import type { ApiActionEvent } from "../api/audit-api"
import type { ColumnDef } from "@tanstack/react-table"

export const columns: Array<ColumnDef<ApiActionEvent>> = [
  {
    accessorKey: "created_at",
    header: () => <span className="pl-4">Time</span>,
    cell: ({ row }) => (
      <RelativeTimeCard
        date={row.original.created_at}
        className="pl-4"
        delay={50}
        closeDelay={150}
        align="start"
      />
    ),
  },
  {
    accessorKey: "actor_username",
    header: "Actor",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <FacehashIcon name={row.original.actor_username || "—"} size={24} />
        <span>{row.original.actor_username || "—"}</span>
      </div>
    ),
  },
  {
    accessorKey: "action_kind",
    header: "Action",
    cell: ({ row }) => (
      <span className="font-mono">{row.original.action_kind}</span>
    ),
  },
  {
    accessorKey: "target_kind",
    header: "Target",
  },
  {
    accessorKey: "inventory_item_name",
    header: "Item",
    cell: ({ row }) => {
      const item = presentAuditItemIdentity(row.original)

      return (
        <div className="flex flex-col gap-0.5">
          <span className="wrap-break-word">{item.primary}</span>
          {item.secondary && (
            <span className="text-xs wrap-break-word text-muted-foreground">
              {item.secondary}
            </span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge className={getAuditStatusClassName(row.original.status)}>
        {formatAuditStatus(row.original.status)}
      </Badge>
    ),
  },
  {
    accessorKey: "error_message",
    header: () => <span className="flex justify-end pr-4">Error</span>,
    cell: ({ row }) => (
      <span className="flex justify-end pr-4 text-sm text-destructive">
        {row.original.error_message || ""}
      </span>
    ),
  },
]
