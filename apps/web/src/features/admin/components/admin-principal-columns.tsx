import { Badge } from "@workspace/ui/components/badge"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import type { ComponentType } from "react"

import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { ColumnDef } from "@tanstack/react-table"

type PrincipalColumnsOptions = {
  icon: ComponentType<{ className?: string }>
  label: string
}

export function getPrincipalColumns({
  icon: Icon,
  label,
}: PrincipalColumnsOptions): Array<ColumnDef<ApiPrincipal>> {
  return [
    {
      accessorKey: "name",
      header: () => <p className="pl-4">Principal</p>,
      cell: ({ row: { original: principal } }) => (
        <div className="flex items-center gap-3 pl-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-secondary text-secondary-foreground">
            {label === "User" ? (
              <FacehashIcon
                name={principal.name ?? principal.external_id}
                size={24}
              />
            ) : (
              <Icon className="size-5" />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="truncate font-medium">
              {principal.name ?? principal.external_id}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {principal.external_id}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row: { original: principal } }) => (
        <span className="text-muted-foreground">
          {principal.description || "-"}
        </span>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: () => <Badge variant="outline">{label}</Badge>,
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row: { original: principal } }) => {
        if (!principal.created_at) return "-"

        return (
          <RelativeTimeCard
            date={principal.created_at}
            display="relative"
            timezones={["UTC"]}
            delay={50}
            closeDelay={150}
            variant="muted"
          />
        )
      },
    },
  ]
}
