import { IconArrowUpRight } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import {
  STATUS_ICONS,
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
  getRequestStatusClassName,
} from "./request-presenters"
import type { ApiRequestSummary } from "@/lib/queries"
import type { ColumnDef } from "@tanstack/react-table"
import { formatVmReference } from "@/lib/utils"

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
        const powerAction = formatRequestPowerAction(
          request.inventory?.power_action
        )

        return (
          <div className="flex min-w-0 flex-col gap-1 pl-4">
            <p className="font-medium">
              {request.inventory?.vmid &&
                formatVmReference(
                  request.inventory.vmid,
                  request.inventory.item_name
                )}
            </p>
            <p className="text-xs text-muted-foreground">
              {powerAction && <p>{powerAction}</p>}
              {request.inventory?.snapshot_name && (
                <p>
                  {formatRequestKind(request.kind)}:{" "}
                  {request.inventory.snapshot_name}
                </p>
              )}
            </p>
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
      accessorKey: "created_at",
      header: "Requested",
      cell: ({ row: { original: request } }) => {
        const date = request.created_at
        if (!date) return "—"
        return (
          <RelativeTimeCard
            date={date}
            timezones={["UTC"]}
            delay={50}
            closeDelay={150}
          />
        )
      },
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
      header: "Reviewed",
      cell: ({ row: { original: request } }) => {
        const date = request.updated_at
        if (!date || request.status === "pending") return "—"
        return (
          <RelativeTimeCard
            date={date}
            timezones={["UTC"]}
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
