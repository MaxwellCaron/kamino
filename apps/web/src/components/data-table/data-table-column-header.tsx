import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Sorting01Icon,
  Sorting02Icon,
  Sorting04Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import type { IconSvgElement } from "@hugeicons/react"
import type { Column } from "@tanstack/react-table"

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>
  title: string
  icon: IconSvgElement
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  icon,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const sorted = column.getIsSorted()
  const sortIcon =
    sorted === "desc"
      ? Sorting01Icon
      : sorted === "asc"
        ? Sorting02Icon
        : Sorting04Icon

  return (
    <Button
      variant={sorted ? "default" : "ghost"}
      onClick={column.getToggleSortingHandler()}
      aria-label={`Sort by ${title}`}
      className={cn(sorted ? "**:text-primary-foreground" : "**:text-muted-foreground")}
    >
      <HugeiconsIcon icon={icon} data-icon="inline-start" />
      <span>{title}</span>
      <HugeiconsIcon icon={sortIcon} data-icon="inline-end" />
    </Button>
  )
}
