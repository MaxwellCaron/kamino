import { IconArrowUpRight } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import {
  STATUS_ICONS,
  formatRequestKind,
  formatRequestStatus,
  getRequestStatusClassName,
  getRequestTargetContext,
  getRequestTargetLabel,
} from "./request-presenters"
import type { ApiRequestSummary } from "@/lib/queries"
import type { ColumnDef } from "@tanstack/react-table"

type RequestColumnsOptions = {
  onOpen: (request: ApiRequestSummary) => void
}

export function getRequestColumns({
  onOpen,
}: RequestColumnsOptions): Array<ColumnDef<ApiRequestSummary>> {
  return [
    {
      accessorKey: "kind",
      header: () => <p className="pl-4">Request</p>,
      cell: ({ row: { original: request } }) => {
        const context = getRequestTargetContext(request)

        return (
          <div className="flex min-w-0 flex-col gap-1 pl-4">
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
      cell: ({ row: { original: request } }) => {
        const StatusIcon = STATUS_ICONS[request.status]

        return (
          <Badge className={getRequestStatusClassName(request.status)}>
            <StatusIcon className="size-3.5!" />
            {formatRequestStatus(request.status)}
          </Badge>
        )
      },
    },
    {
      accessorKey: "requester_username",
      header: "Requester",
      cell: ({ row: { original: request } }) => (
        <div className="flex items-center gap-2">
          <FacehashIcon name={request.requester_username} size={24} />
          <span>{request.requester_username}</span>
        </div>
      ),
    },
    {
      accessorKey: "reviewer_username",
      header: "Reviewer",
      cell: ({ row: { original: request } }) =>
        request.reviewer_username ? (
          <div className="flex items-center gap-2">
            <FacehashIcon name={request.reviewer_username} size={24} />
            <span>{request.reviewer_username}</span>
          </div>
        ) : (
          "—"
        ),
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row: { original: request } }) => {
        const date = request.updated_at ?? request.created_at
        if (!date) return "—"
        return (
          <RelativeTimeCard
            date={date}
            timezones={["UTC"]}
            align="start"
            delay={50}
            closeDelay={150}
          />
        )
      },
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
