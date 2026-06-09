import { IconArrowUpRight } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import { findTreePath } from "@/features/inventory/utils/inventory-tree"
import {
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
  getRequestIcon,
  getRequestStatusClassName,
} from "@/features/requests/utils/request-presenters"
import { formatVmReference } from "@/features/shared/utils/format"

type ActivityColumnsOptions = {
  onOpen: (request: ApiRequestSummary) => void
  tree?: Array<ApiTreeNode>
}

export function getDashboardActivityColumns({
  onOpen,
  tree,
}: ActivityColumnsOptions): Array<ColumnDef<ApiRequestSummary>> {
  return [
    {
      accessorKey: "kind",
      header: () => <p className="pl-4">Request</p>,
      cell: ({ row: { original: request } }) => {
        const Icon = getRequestIcon(
          request.kind,
          request.inventory?.power_action
        )
        const path =
          tree && request.inventory?.item_id
            ? findTreePath(tree, request.inventory.item_id)
            : null
        const pathLabel = path
          ? path
              .slice(0, -1)
              .map((node) => node.name)
              .join(" / ")
          : null

        return (
          <div className="flex items-center gap-3 pl-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-secondary text-secondary-foreground">
              <Icon className="size-5" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="font-medium">{getRequestTitle(request)}</div>
              <p className="truncate text-xs text-muted-foreground">
                {pathLabel ? `${pathLabel} / ` : ""}
                {getRequestTargetLabel(request)}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row: { original: request } }) => (
        <Badge className={getRequestStatusClassName(request.status)}>
          {formatRequestStatus(request.status)}
        </Badge>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Requested",
      cell: ({ row: { original: request } }) =>
        request.created_at ? (
          <RelativeTimeCard
            date={request.created_at}
            timezones={["UTC"]}
            delay={50}
            closeDelay={150}
          />
        ) : (
          "—"
        ),
    },
    {
      accessorKey: "updated_at",
      header: "Reviewed",
      cell: ({ row: { original: request } }) =>
        request.updated_at && request.status !== "pending" ? (
          <RelativeTimeCard
            date={request.updated_at}
            timezones={["UTC"]}
            delay={50}
            closeDelay={150}
          />
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      meta: { className: "w-0" },
      header: () => null,
      cell: ({ row: { original: request } }) => (
        <div className="flex justify-end pr-6">
          <Button variant="outline" size="sm" onClick={() => onOpen(request)}>
            View
            <IconArrowUpRight data-icon="inline-end" />
          </Button>
        </div>
      ),
    },
  ]
}

function getRequestTitle(request: ApiRequestSummary) {
  const powerAction = formatRequestPowerAction(request.inventory?.power_action)
  if (powerAction) {
    return powerAction
  }

  if (request.inventory?.snapshot_name) {
    return `${formatRequestKind(request.kind)}: ${request.inventory.snapshot_name}`
  }

  return formatRequestKind(request.kind)
}

function getRequestTargetLabel(request: ApiRequestSummary) {
  if (request.inventory?.vmid) {
    return formatVmReference(
      request.inventory.vmid,
      request.inventory.item_name ?? undefined
    )
  }

  return request.inventory?.item_name ?? "Inventory item"
}
