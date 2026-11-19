import {
  formatPrincipalReference,
  getPrincipalBaseName,
} from "@/lib/principals/principal-label"
import type { ApiPrincipal } from "@/lib/principals/principals-types"
import type { AppTableFeatures } from "@/lib/data-table-types"
import type { ColumnDef } from "@tanstack/react-table"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"

type PrincipalColumnsOptions = {
  icon: IconSvgElement
  label: string
}

export function getPrincipalColumns({
  icon: Icon,
  label,
}: PrincipalColumnsOptions): Array<ColumnDef<AppTableFeatures, ApiPrincipal>> {
  return [
    {
      accessorKey: "name",
      header: () => <p className="pl-4">Principal</p>,
      cell: ({ row: { original: principal } }) => (
        <div className="flex items-center gap-3 pl-4">
          {label === "User" ? (
            <FacehashIcon name={getPrincipalBaseName(principal)} size={32} />
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <HugeiconsIcon
                icon={Icon}
                className="size-5 text-muted-foreground"
              />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="truncate font-medium">
              {formatPrincipalReference(principal)}
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row: { original: principal } }) => {
        if (!principal.created_at) return "-"

        return (
          <RelativeTimeCard
            date={principal.created_at}
            timezones={["UTC"]}
            delay={50}
            closeDelay={150}
            variant="muted"
          />
        )
      },
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
  ]
}
