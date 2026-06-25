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
  TableRow,
} from "@workspace/ui/components/table"
import { AnimatePresence, m } from "motion/react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconSearch, IconX } from "@tabler/icons-react"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Fragment, useRef, useState } from "react"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableStateRow } from "./data-table-state-row"
import type { ComponentType, ReactNode } from "react"
import type { DataTableSelectionActionsContext } from "./data-table-types"
import type {
  ColumnDef,
  ExpandedState,
  RowSelectionState,
  TableOptions,
} from "@tanstack/react-table"
import { loadingTransition } from "@/components/loading-transition"

const LOADING_ROW_IDS = ["loading-row-1", "loading-row-2", "loading-row-3"]

interface DataTableProps<TData, TValue> {
  columns: Array<ColumnDef<TData, TValue>>
  data: Array<TData>
  isLoading?: boolean
  error: Error | null
  getRowId?: TableOptions<TData>["getRowId"]
  initialPageSize?: number
  enablePagination?: boolean
  showSelectionSummary?: boolean
  selectionActions?: (
    context: DataTableSelectionActionsContext<TData>
  ) => ReactNode
  expandedRowComponent?: ComponentType<{ row: TData }>
  getRowCanExpand?: (row: TData) => boolean
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  error,
  getRowId,
  initialPageSize = 25,
  enablePagination = true,
  showSelectionSummary = true,
  selectionActions,
  expandedRowComponent: ExpandedRowComponent,
  getRowCanExpand,
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = useState("")
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const hasBeenLoading = useRef(isLoading)
  if (isLoading) hasBeenLoading.current = true
  const notReady = isLoading || error !== null

  const table = useReactTable({
    data,
    columns,
    getRowId,
    enableRowSelection: true,
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: getRowCanExpand
      ? (row) => getRowCanExpand(row.original)
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: enablePagination
      ? getPaginationRowModel()
      : undefined,
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    globalFilterFn: "includesString",
    state: {
      globalFilter,
      rowSelection,
      expanded,
    },
    initialState: enablePagination
      ? {
          pagination: {
            pageSize: initialPageSize,
          },
        }
      : undefined,
  })
  const selectedRows = table
    .getSelectedRowModel()
    .rows.map((row) => row.original)
  const clearSelection = () => setRowSelection({})

  return (
    <div>
      <div className="flex items-center justify-between gap-6 px-6">
        <InputGroup className="max-w-sm">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search..."
            value={globalFilter}
            onChange={(e) => table.setGlobalFilter(String(e.target.value))}
            disabled={notReady}
          />
        </InputGroup>

        {enablePagination && (
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
                <SelectValue
                  placeholder={table.getState().pagination.pageSize}
                />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="end">
                <SelectGroup>
                  <SelectLabel>Rows</SelectLabel>
                  {[10, 20, 25, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="overflow-hidden py-6">
        <Table className="border-y">
          <m.thead
            data-slot="table-header"
            className="bg-muted hover:bg-muted [&_tr]:border-b"
            initial={hasBeenLoading.current ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={loadingTransition}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
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
                  )
                })}
              </TableRow>
            ))}
          </m.thead>
          <AnimatePresence initial={false} mode="wait">
            <m.tbody
              key={isLoading ? "loading" : "loaded"}
              data-slot="table-body"
              initial={
                hasBeenLoading.current ? { opacity: 0, y: 4 } : false
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={loadingTransition}
              className="overflow-hidden [&_tr:last-child]:border-0"
            >
              {isLoading ? (
                LOADING_ROW_IDS.map((rowID) => (
                  <TableRow key={rowID}>
                    <TableCell className="pl-6">
                      <Skeleton className="size-5 rounded" />
                    </TableCell>
                    {table
                      .getAllLeafColumns()
                      .slice(1)
                      .map((column) => (
                        <TableCell key={column.id}>
                          <Skeleton className="h-6 w-3/4 rounded" />
                        </TableCell>
                      ))}
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <Fragment key={row.id}>
                    <TableRow data-state={row.getIsSelected() && "selected"}>
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
                    {row.getIsExpanded() && ExpandedRowComponent && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={row.getVisibleCells().length}
                          className="p-0"
                        >
                          <ExpandedRowComponent row={row.original} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              ) : (
                <DataTableStateRow colSpan={columns.length} error={error} />
              )}
            </m.tbody>
          </AnimatePresence>
        </Table>
      </div>
      {enablePagination ? (
        <DataTablePagination
          table={table}
          showSelectionSummary={showSelectionSummary}
        />
      ) : null}
      {selectionActions && (
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
            {selectionActions({ clearSelection, selectedRows })}
          </ActionBarGroup>
          <ActionBarClose aria-label="Clear selection">
            <IconX />
          </ActionBarClose>
        </ActionBar>
      )}
    </div>
  )
}
