import type { ColumnDef } from "@tanstack/react-table"
import { IconArrowUpRight } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import type { ApiRequestSummary } from "@/lib/queries"
import {
  formatRequestKind,
  formatRequestStatus,
  formatRequestTimestamp,
  getRequestTargetContext,
  getRequestTargetLabel,
  requestStatusVariant,
} from "./request-presenters"

type RequestColumnsOptions = {
  onOpen: (request: ApiRequestSummary) => void
}

export function getRequestColumns({
  onOpen,
}: RequestColumnsOptions): Array<ColumnDef<ApiRequestSummary>> {
  return [
    {
      accessorKey: "kind",
      header: "Request",
      cell: ({ row: { original: request } }) => {
        const context = getRequestTargetContext(request)

        return (
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-medium">{getRequestTargetLabel(request)}</p>
            <p className="text-xs text-muted-foreground">
              {formatRequestKind(request.kind)}
            </p>
            {context ? (
              <p className="truncate text-xs text-muted-foreground">
                {context}
              </p>
            ) : null}
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row: { original: request } }) => (
        <Badge variant={requestStatusVariant(request.status)}>
          {formatRequestStatus(request.status)}
        </Badge>
      ),
    },
    {
      accessorKey: "requester_username",
      header: "Requester",
    },
    {
      accessorKey: "reviewer_username",
      header: "Reviewer",
      cell: ({ row: { original: request } }) =>
        request.reviewer_username?.trim() || "—",
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row: { original: request } }) =>
        formatRequestTimestamp(request.updated_at ?? request.created_at),
    },
    {
      id: "actions",
      meta: { className: "w-0" },
      header: () => null,
      cell: ({ row: { original: request } }) => (
        <div className="flex justify-end pr-6">
          <Button variant="outline" size="sm" onClick={() => onOpen(request)}>
            {request.status === "pending" ? "Review" : "View"}
            <IconArrowUpRight data-icon="inline-end" />
          </Button>
        </div>
      ),
    },
  ]
}
