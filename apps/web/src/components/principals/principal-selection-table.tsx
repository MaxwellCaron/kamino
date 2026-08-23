import { HugeiconsIcon } from "@hugeicons/react"
import { UserGroupIcon, UserIcon } from "@hugeicons/core-free-icons"
import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { flexRender, useTable } from "@tanstack/react-table"
import { useMemo } from "react"
import type { AppTableFeatures } from "@/components/data-table/data-table-types"
import type {
  ColumnDef,
  OnChangeFn,
  RowSelectionState,
} from "@tanstack/react-table"
import { appTableFeatures } from "@/components/data-table/data-table-types"

export type PrincipalSelectionItem = {
  description: string
  id: string
  label: string
  type: "group" | "user"
}

export type PrincipalSelectionTableProps = {
  data: Array<PrincipalSelectionItem>
  emptyMessage?: string
  onRowSelectionChange: OnChangeFn<RowSelectionState>
  rowSelection: RowSelectionState
  selectAllLabel?: string
}

export function PrincipalSelectionTable({
  data,
  emptyMessage = "No results.",
  onRowSelectionChange,
  rowSelection,
  selectAllLabel = "Select all",
}: PrincipalSelectionTableProps) {
  const columns = useMemo<
    Array<ColumnDef<AppTableFeatures, PrincipalSelectionItem>>
  >(
    () => [
      {
        accessorKey: "label",
        header: ({ table: principalTable }) => (
          <div className="flex items-center gap-3 pl-4">
            <Checkbox
              checked={principalTable.getIsAllPageRowsSelected()}
              indeterminate={principalTable.getIsSomePageRowsSelected()}
              onCheckedChange={(value) =>
                principalTable.toggleAllPageRowsSelected(!!value)
              }
              aria-label={selectAllLabel}
            />
            <span>Name</span>
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-3 pl-4">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label={`Select ${row.original.label}`}
            />
            <span>{row.original.label}</span>
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row: { original: principal } }) => (
          <Badge variant={principal.type === "user" ? "default" : "secondary"}>
            <HugeiconsIcon
              icon={principal.type === "user" ? UserIcon : UserGroupIcon}
              aria-hidden="true"
            />
            {principal.type.charAt(0).toUpperCase() + principal.type.slice(1)}
          </Badge>
        ),
      },
    ],
    [selectAllLabel]
  )

  const table = useTable({
    features: appTableFeatures,
    data,
    columns,
    enableRowSelection: true,
    getRowId: (principal) => principal.id,
    manualPagination: true,
    onRowSelectionChange,
    state: { rowSelection },
  })

  return (
    <Table>
      <TableHeader className="bg-muted hover:bg-muted">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                className={
                  header.column.id === "type"
                    ? "w-0 pr-4 text-center"
                    : undefined
                }
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && "selected"}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={
                    cell.column.id === "type"
                      ? "w-0 pr-4 text-center"
                      : undefined
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={2}
              className="h-24 text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
