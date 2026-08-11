import { Checkbox } from "@workspace/ui/components/checkbox"
import type { ColumnDef } from "@tanstack/react-table"

type RowSelectionColumnOptions<TData> = {
  isRowDisabled?: (row: TData) => boolean
}

export function createRowSelectionColumn<TData>(
  getRowLabel: (row: TData) => string,
  options?: RowSelectionColumnOptions<TData>
): ColumnDef<TData> {
  return {
    id: "select",
    enableSorting: false,
    meta: { className: "w-0" },
    header: ({ table }) => (
      <div className="pl-4">
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all rows on this page"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="pl-4">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          disabled={options?.isRowDisabled?.(row.original)}
          aria-label={`Select ${getRowLabel(row.original)}`}
        />
      </div>
    ),
  }
}
