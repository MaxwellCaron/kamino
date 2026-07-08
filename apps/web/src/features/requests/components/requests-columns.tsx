import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import {
  STATUS_ICONS,
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
  getRequestIcon,
  getRequestStatusClassName,
} from "../utils/request-presenters"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ColumnDef } from "@tanstack/react-table"
import { findTreePath } from "@/features/inventory/utils/inventory-tree"
import { formatVmReference } from "@/features/shared/utils/format"

type RequestColumnsOptions = {
  onOpen: (request: ApiRequestSummary) => void
  selectable?: boolean
  tree?: Array<ApiTreeNode>
  excludeColumns?: Array<string>
}

export function getRequestColumns({
  onOpen,
  selectable = true,
  tree,
  excludeColumns = [],
}: RequestColumnsOptions): Array<ColumnDef<ApiRequestSummary>> {
  const allColumns: Array<ColumnDef<ApiRequestSummary>> = [
    ...(selectable
      ? [
          {
            id: "select",
            meta: { className: "w-0" },
            header: ({ table }) => (
              <div className="pl-4">
                <Checkbox
                  checked={table.getIsAllPageRowsSelected()}
                  indeterminate={table.getIsSomePageRowsSelected()}
                  onCheckedChange={(value) =>
                    table.toggleAllPageRowsSelected(!!value)
                  }
                  aria-label="Select all"
                />
              </div>
            ),
            cell: ({ row }) => (
              <div className="pl-4">
                <Checkbox
                  checked={row.getIsSelected()}
                  onCheckedChange={(value) => row.toggleSelected(!!value)}
                  aria-label="Select row"
                />
              </div>
            ),
          } satisfies ColumnDef<ApiRequestSummary>,
        ]
      : []),
    {
      accessorKey: "kind",
      header: () => <p className="pl-4">Request</p>,
      cell: ({ row: { original: request } }) => {
        const powerAction = formatRequestPowerAction(
          request.inventory?.power_action
        )

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
              .slice(1, -1)
              .map((n) => n.name)
              .join(" / ")
          : null
        const targetLabel = request.inventory?.vmid
          ? formatVmReference(
              request.inventory.vmid,
              request.inventory.item_name
            )
          : request.kind === "personal_pod.create"
            ? "Personal pod"
            : (request.inventory?.item_name ?? "Inventory item")

        return (
          <div className="flex items-center gap-3 pl-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-secondary text-secondary-foreground">
              <HugeiconsIcon icon={Icon} className="size-5" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-col">
                <div className="font-medium">
                  {powerAction ||
                    (request.inventory?.snapshot_name ? (
                      <span>
                        {formatRequestKind(request.kind)}:{" "}
                        {request.inventory.snapshot_name}
                      </span>
                    ) : (
                      formatRequestKind(request.kind)
                    ))}
                </div>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {pathLabel ? `${pathLabel} / ` : ""}
                {targetLabel}
              </p>
            </div>
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
            <HugeiconsIcon icon={StatusIcon} className="size-3.5!" />
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
            <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" />
          </Button>
        </div>
      ),
    },
  ]

  if (excludeColumns.length === 0) return allColumns

  const excludedColumnIds = new Set(excludeColumns)

  return allColumns.filter((col) => {
    const id = "accessorKey" in col ? (col.accessorKey as string) : col.id
    return !excludedColumnIds.has(id as string)
  })
}
