import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { flexRender, useTable } from "@tanstack/react-table"

import { appTableFeatures } from "./data-table-types"
import { DataTableStateRow } from "./data-table-state-row"
import type { AppTableFeatures } from "./data-table-types"
import type { ColumnDef, RowData, TableOptions } from "@tanstack/react-table"

export type SimpleDataTableProps<TData extends RowData, TValue> = {
  columns: Array<ColumnDef<AppTableFeatures, TData, TValue>>
  data: Array<TData>
  error: Error | null
  getRowId?: TableOptions<AppTableFeatures, TData>["getRowId"]
  isLoading: boolean
}

export function SimpleDataTable<TData extends RowData, TValue>({
  columns,
  data,
  error,
  getRowId,
  isLoading,
}: SimpleDataTableProps<TData, TValue>) {
  const table = useTable({
    features: appTableFeatures,
    data,
    columns: columns as Array<ColumnDef<AppTableFeatures, TData>>,
    getRowId,
    manualPagination: true,
  })

  return (
    <div
      className="overflow-hidden **:no-scrollbar"
      role="status"
      aria-live="polite"
      aria-busy={isLoading || undefined}
    >
      <Table className="border-y">
        <TableHeader className="bg-muted hover:bg-muted [&_tr]:border-b">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.columnDef.meta?.className}
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
        <TableBody className="overflow-hidden [&_tr:last-child]:border-0">
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cell.column.columnDef.meta?.className}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <DataTableStateRow colSpan={columns.length} error={error} />
          )}
        </TableBody>
      </Table>
    </div>
  )
}
