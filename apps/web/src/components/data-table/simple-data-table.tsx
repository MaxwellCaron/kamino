import { useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableCell,
  TableHead,
  TableRow,
} from "@workspace/ui/components/table"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

import type {
  ColumnDef,
  RowSelectionState,
  TableOptions,
} from "@tanstack/react-table"
import { loadingTransition } from "@/components/loading-transition"

interface SimpleDataTableProps<TData, TValue> {
  columns: Array<ColumnDef<TData, TValue>>
  data: Array<TData>
  error: Error | null
  getRowId?: TableOptions<TData>["getRowId"]
  isLoading: boolean
  skeletonRows?: number
}

export function SimpleDataTable<TData, TValue>({
  columns,
  data,
  error,
  getRowId,
  isLoading,
  skeletonRows = 3,
}: SimpleDataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const hasBeenLoading = useRef(isLoading)
  if (isLoading) hasBeenLoading.current = true

  const table = useReactTable({
    data,
    columns,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    onRowSelectionChange: setRowSelection,
    state: {
      rowSelection,
    },
  })

  return (
    <div className="overflow-hidden">
      <Table className="border-y">
        <motion.thead
          data-slot="table-header"
          className="bg-muted hover:bg-muted [&_tr]:border-b"
          initial={hasBeenLoading.current ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={loadingTransition}
        >
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
        </motion.thead>
        <AnimatePresence mode="wait">
          <motion.tbody
            key={isLoading ? "loading" : "loaded"}
            data-slot="table-body"
            initial={hasBeenLoading.current ? { opacity: 0, height: 0 } : false}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={loadingTransition}
            className="overflow-hidden [&_tr:last-child]:border-0"
          >
            {isLoading ? (
              Array.from({ length: skeletonRows }, (_row, index) => (
                <TableRow key={index}>
                  <TableCell className="pl-6">
                    <Skeleton className="size-5 rounded" />
                  </TableCell>
                  {columns.slice(1).map((__, columnIndex) => (
                    <TableCell key={columnIndex}>
                      <Skeleton className="h-6 w-3/4 rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
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
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className={`h-24 text-center ${error !== null ? "text-destructive" : ""}`}
                >
                  {error ? error.message : "No results."}
                </TableCell>
              </TableRow>
            )}
          </motion.tbody>
        </AnimatePresence>
      </Table>
    </div>
  )
}
