import {
  ActionBar,
  ActionBarClose,
  ActionBarGroup,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { AnimatePresence, motion } from "motion/react"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconX } from "@tabler/icons-react"

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useRef, useState } from "react"
import { DataTablePagination } from "./data-table-pagination"
import type { ReactNode } from "react"
import type {
  ColumnDef,
  RowSelectionState,
  TableOptions,
} from "@tanstack/react-table"
import { loadingTransition } from "@/components/loading-transition"

type DataTableSelectionActionsContext<TData> = {
  clearSelection: () => void
  selectedRows: Array<TData>
}

interface DataTableProps<TData, TValue> {
  columns: Array<ColumnDef<TData, TValue>>
  data: Array<TData>
  isLoading: boolean
  error: Error | null
  getRowId?: TableOptions<TData>["getRowId"]
  renderSelectionActions?: (
    context: DataTableSelectionActionsContext<TData>
  ) => ReactNode
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  error,
  getRowId,
  renderSelectionActions,
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = useState("")
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const hasBeenLoading = useRef(isLoading)
  if (isLoading) hasBeenLoading.current = true
  const notReady = isLoading || error !== null

  const table = useReactTable({
    data,
    columns,
    getRowId,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: "includesString",
    state: {
      globalFilter,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: 25,
      },
    },
  })
  const selectedRows = table
    .getSelectedRowModel()
    .rows.map((row) => row.original)
  const clearSelection = () => setRowSelection({})

  return (
    <div>
      <div className="flex items-center justify-between gap-6 px-6">
        <Input
          placeholder="Search..."
          value={globalFilter}
          onChange={(e) => table.setGlobalFilter(String(e.target.value))}
          className="max-w-sm"
          disabled={notReady}
        />
        <div className="flex items-center gap-2">
          <p className="hidden text-sm font-medium lg:block">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
            disabled={notReady}
          >
            <SelectTrigger>
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end">
              {[10, 20, 25, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="overflow-hidden py-6">
        <Table className="table-fixed border-y">
          <TableHeader className="bg-muted hover:bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={{
                        width:
                          header.column.getSize() === 150
                            ? undefined
                            : header.column.getSize(),
                      }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <AnimatePresence mode="wait">
            <motion.tbody
              key={isLoading ? "loading" : "loaded"}
              data-slot="table-body"
              initial={
                hasBeenLoading.current ? { opacity: 0, height: 0 } : false
              }
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={loadingTransition}
              className="overflow-hidden [&_tr:last-child]:border-0"
            >
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    Loading...
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={{
                          width:
                            cell.column.getSize() === 150
                              ? undefined
                              : cell.column.getSize(),
                        }}
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
      <DataTablePagination table={table} />
      {renderSelectionActions && (
        <ActionBar
          open={selectedRows.length > 0}
          onOpenChange={(open) => {
            if (!open) clearSelection()
          }}
        >
          <ActionBarSelection>
            {selectedRows.length}{" "}
            <span className="hidden lg:block">selected</span>
          </ActionBarSelection>
          <ActionBarSeparator />
          <ActionBarGroup>
            {renderSelectionActions({ clearSelection, selectedRows })}
          </ActionBarGroup>
          <ActionBarClose aria-label="Clear selection">
            <IconX />
          </ActionBarClose>
        </ActionBar>
      )}
    </div>
  )
}
