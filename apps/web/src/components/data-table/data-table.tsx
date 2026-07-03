import {
  ActionBar,
  ActionBarClose,
  ActionBarGroup,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
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
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"
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
  OnChangeFn,
  PaginationState,
  RowSelectionState,
  TableOptions,
} from "@tanstack/react-table"

const LOADING_ROW_IDS = ["loading-row-1", "loading-row-2", "loading-row-3"]

const ROWS_PER_PAGE_OPTIONS = [10, 20, 25, 30, 40, 50]

/**
 * Server-pagination mode for DataTable. When provided, the table no longer
 * paginates or filters rows locally: `data` is treated as the current API
 * page only, `pagination`/`onPaginationChange` are controlled by the
 * consumer, and `search`/`onSearchChange` drive a server-side search query
 * instead of TanStack's local global filter.
 */
export type DataTableServerPagination = {
  mode: "server"
  pagination: PaginationState
  onPaginationChange: OnChangeFn<PaginationState>
  rowCount: number
  search: string
  onSearchChange: (value: string) => void
}

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
  serverPagination?: DataTableServerPagination
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
  serverPagination,
}: DataTableProps<TData, TValue>) {
  const isServerMode = serverPagination?.mode === "server"
  const [globalFilter, setGlobalFilter] = useState("")
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const hasBeenLoading = useRef(isLoading)
  if (isLoading) hasBeenLoading.current = true
  const notReady = isLoading || error !== null

  const searchValue = isServerMode ? serverPagination.search : globalFilter
  const onSearchChange = isServerMode
    ? serverPagination.onSearchChange
    : (value: string) => setGlobalFilter(value)

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
    getPaginationRowModel:
      enablePagination && !isServerMode ? getPaginationRowModel() : undefined,
    getFilteredRowModel: isServerMode ? undefined : getFilteredRowModel(),
    manualPagination: isServerMode,
    rowCount: isServerMode ? serverPagination.rowCount : undefined,
    ...(isServerMode
      ? { onPaginationChange: serverPagination.onPaginationChange }
      : {}),
    onGlobalFilterChange: isServerMode ? undefined : setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    globalFilterFn: isServerMode ? undefined : "includesString",
    state: {
      ...(isServerMode
        ? { pagination: serverPagination.pagination }
        : { globalFilter }),
      rowSelection,
      expanded,
    },
    initialState:
      enablePagination && !isServerMode
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
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search..."
            value={searchValue}
            onChange={(e) => {
              const value = String(e.target.value)
              if (isServerMode) {
                onSearchChange(value)
                serverPagination.onPaginationChange((prev) => ({
                  ...prev,
                  pageIndex: 0,
                }))
              } else {
                table.setGlobalFilter(value)
              }
            }}
            disabled={notReady}
          />
        </InputGroup>

        {enablePagination && (
          <div className="flex items-center gap-2">
            <p className="hidden text-sm font-medium lg:block">Rows per page</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                if (isServerMode) {
                  serverPagination.onPaginationChange((prev) => ({
                    ...prev,
                    pageSize: Number(value),
                    pageIndex: 0,
                  }))
                } else {
                  table.setPageSize(Number(value))
                }
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
                  {ROWS_PER_PAGE_OPTIONS.map((pageSize) => (
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
          <TableHeader className="bg-muted hover:bg-muted [&_tr]:border-b">
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
          </TableHeader>
          <TableBody className="overflow-hidden [&_tr:last-child]:border-0">
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
          </TableBody>
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
            <HugeiconsIcon icon={Cancel01Icon} />
          </ActionBarClose>
        </ActionBar>
      )}
    </div>
  )
}
