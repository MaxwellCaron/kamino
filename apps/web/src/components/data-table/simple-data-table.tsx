import { AnimatePresence, m } from "motion/react"
import {
  Table,
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

import { animateContainer, animateTableRow } from "../animate"
import { DataTableStateRow } from "./data-table-state-row"
import type { ColumnDef, TableOptions } from "@tanstack/react-table"
import type { Key } from "react"

const MotionTableRow = m.create(TableRow)

export type SimpleDataTableProps<TData, TValue> = {
  animationKey?: Key
  columns: Array<ColumnDef<TData, TValue>>
  data: Array<TData>
  error: Error | null
  getRowId?: TableOptions<TData>["getRowId"]
  isLoading: boolean
}

export function SimpleDataTable<TData, TValue>({
  animationKey,
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
  const dataAnimationKey = JSON.stringify(
    table.getCoreRowModel().rows.map((row) => row.id)
  )
  const resolvedAnimationKey = animationKey ?? dataAnimationKey

  return (
    <div className="overflow-hidden **:no-scrollbar">
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
        <AnimatePresence>
          <m.tbody
            key={`${String(resolvedAnimationKey)}-${isLoading ? "loading" : "loaded"}`}
            className="overflow-hidden [&_tr:last-child]:border-0"
            initial="hidden"
            animate="show"
            variants={animateContainer}
          >
            <AnimatePresence mode="popLayout">
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <MotionTableRow key={row.id} variants={animateTableRow}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cell.column.columnDef.meta?.className}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </MotionTableRow>
                ))
              ) : (
                <DataTableStateRow colSpan={columns.length} error={error} />
              )}
            </AnimatePresence>
          </m.tbody>
        </AnimatePresence>
      </Table>
    </div>
  )
}
