import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

import { DataTableStateRow } from "./data-table-state-row"
import type { ColumnDef, TableOptions } from "@tanstack/react-table"

export type SimpleDataTableProps<TData, TValue> = {
  columns: Array<ColumnDef<TData, TValue>>
  data: Array<TData>
  error: Error | null
  getRowId?: TableOptions<TData>["getRowId"]
  isLoading: boolean
}

export function SimpleDataTable<TData, TValue>({
  columns,
  data,
  error,
  getRowId,
  isLoading,
}: SimpleDataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
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
