import { useMemo } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/badge"

import { actionEventsQueryOptions } from "../api/audit-api"
import type { ApiActionEvent } from "../api/audit-api"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"

const columns: Array<ColumnDef<ApiActionEvent>> = [
  {
    accessorKey: "created_at",
    header: "Time",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm tabular-nums">
        {row.original.created_at}
      </span>
    ),
    meta: { className: "whitespace-nowrap" },
  },
  {
    accessorKey: "actor_username",
    header: "Actor",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.actor_username || "—"}</span>
    ),
  },
  {
    accessorKey: "action_kind",
    header: "Action",
    cell: ({ row }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {row.original.action_kind}
      </code>
    ),
  },
  {
    accessorKey: "target_kind",
    header: "Target",
  },
  {
    accessorKey: "inventory_item_name",
    header: "Item",
    cell: ({ row }) => row.original.inventory_item_name || "—",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const variant =
        row.original.status === "succeeded"
          ? "default"
          : row.original.status === "failed"
            ? "destructive"
            : "secondary"
      return <Badge variant={variant}>{row.original.status}</Badge>
    },
  },
  {
    accessorKey: "error_message",
    header: "Error",
    cell: ({ row }) => (
      <span className="text-destructive text-sm">
        {row.original.error_message || ""}
      </span>
    ),
  },
]

export function AuditPage() {
  const {
    data,
    error,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(actionEventsQueryOptions())

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data?.pages]
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Ledger</h1>
        <p className="text-muted-foreground text-sm">
          Direct VM and pod actions performed outside request workflows.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading || isFetchingNextPage}
        error={error}
        enablePagination={false}
        showSelectionSummary={false}
      />

      {hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {data?.pages[0] && (
        <p className="text-center text-sm text-muted-foreground">
          {data.pages[0].total} total events
        </p>
      )}
    </div>
  )
}
