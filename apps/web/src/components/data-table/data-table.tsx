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
import { flexRender, useTable } from "@tanstack/react-table"
import { Fragment, useState } from "react"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableStateRow } from "./data-table-state-row"
import { appTableFeatures, defaultDataTableFeatures } from "./data-table-types"
import type { ComponentType, ReactNode } from "react"
import type {
  AppTableFeatures,
  DataTableFeatures,
  DataTableSelectionActionsContext,
} from "./data-table-types"
import type {
  ColumnDef,
  ExpandedState,
  OnChangeFn,
  PaginationState,
  ReactTable,
  RowData,
  RowSelectionState,
  SortingState,
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

interface DataTableProps<TData extends RowData, TValue> {
  columns: Array<ColumnDef<AppTableFeatures, TData, TValue>>
  data: Array<TData>
  emptyMessage?: string
  error: Error | null
  features?: DataTableFeatures
  getRowId?: TableOptions<AppTableFeatures, TData>["getRowId"]
  initialPageSize?: number
  initialSorting?: SortingState
  selectionActions?: (
    context: DataTableSelectionActionsContext<TData>
  ) => ReactNode
  expandedRowComponent?: ComponentType<{ row: TData }>
  getRowCanExpand?: (row: TData) => boolean
  serverPagination?: DataTableServerPagination
  searchLabel?: string
}

function DataTableToolbar<TData extends RowData>({
  disabled,
  enablePagination,
  searchLabel,
  searchValue,
  serverPagination,
  table,
}: {
  disabled: boolean
  enablePagination: boolean
  searchLabel: string
  searchValue: string
  serverPagination?: DataTableServerPagination
  table: ReactTable<AppTableFeatures, TData>
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-6">
      <InputGroup className="max-w-sm">
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={searchLabel}
          placeholder="Search..."
          value={searchValue}
          onChange={(event) => {
            const value = String(event.target.value)
            if (serverPagination) {
              serverPagination.onSearchChange(value)
              serverPagination.onPaginationChange((previous) => ({
                ...previous,
                pageIndex: 0,
              }))
              return
            }
            table.setGlobalFilter(value)
          }}
          disabled={disabled}
        />
      </InputGroup>

      {enablePagination ? (
        <div className="flex items-center gap-2">
          <p className="hidden text-sm font-medium lg:block">Rows per page</p>
          <Select
            value={`${table.state.pagination.pageSize}`}
            onValueChange={(value) => {
              if (serverPagination) {
                serverPagination.onPaginationChange((previous) => ({
                  ...previous,
                  pageSize: Number(value),
                  pageIndex: 0,
                }))
                return
              }
              table.setPageSize(Number(value))
            }}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Rows per page">
              <SelectValue placeholder={table.state.pagination.pageSize} />
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
      ) : null}
    </div>
  )
}

function DataTableContent<TData extends RowData, TValue>({
  columns,
  emptyMessage,
  error,
  ExpandedRowComponent,
  isLoading,
  table,
}: {
  columns: Array<ColumnDef<AppTableFeatures, TData, TValue>>
  emptyMessage?: string
  error: Error | null
  ExpandedRowComponent?: ComponentType<{ row: TData }>
  isLoading: boolean
  table: ReactTable<AppTableFeatures, TData>
}) {
  return (
    <div className="overflow-hidden py-6">
      <Table className="border-y">
        <TableHeader className="bg-muted hover:bg-muted [&_tr]:border-b">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  aria-sort={
                    header.column.getIsSorted() === "asc"
                      ? "ascending"
                      : header.column.getIsSorted() === "desc"
                        ? "descending"
                        : undefined
                  }
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
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                {row.getIsExpanded() && ExpandedRowComponent ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={row.getVisibleCells().length}
                      className="p-0"
                    >
                      <ExpandedRowComponent row={row.original} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))
          ) : (
            <DataTableStateRow
              colSpan={columns.length}
              error={error}
              emptyMessage={emptyMessage}
            />
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function DataTableSelectionBar<TData extends RowData>({
  clearSelection,
  selectedRows,
  selectionActions,
}: {
  clearSelection: () => void
  selectedRows: Array<TData>
  selectionActions?: (
    context: DataTableSelectionActionsContext<TData>
  ) => ReactNode
}) {
  if (!selectionActions) return null

  return (
    <ActionBar
      open={selectedRows.length > 0}
      onOpenChange={(open) => {
        if (!open) clearSelection()
      }}
    >
      <ActionBarSelection role="status" aria-live="polite" aria-atomic>
        {selectedRows.length} <span className="hidden lg:block">selected</span>
      </ActionBarSelection>
      <ActionBarSeparator />
      <ActionBarGroup>
        {selectionActions({ clearSelection, selectedRows })}
      </ActionBarGroup>
      <ActionBarClose aria-label="Clear selection">
        <HugeiconsIcon icon={Cancel01Icon} />
      </ActionBarClose>
    </ActionBar>
  )
}

export function DataTable<TData extends RowData, TValue>({
  columns,
  data,
  emptyMessage,
  error,
  features: featuresInput,
  getRowId,
  initialPageSize = 25,
  initialSorting = [],
  selectionActions,
  expandedRowComponent: ExpandedRowComponent,
  getRowCanExpand,
  serverPagination,
  searchLabel = "Search table",
}: DataTableProps<TData, TValue>) {
  const features = { ...defaultDataTableFeatures, ...featuresInput }
  const {
    loading: isLoading,
    pagination: enablePagination,
    sorting: enableSorting,
    selectionSummary: showSelectionSummary,
  } = features
  const isServerMode = serverPagination?.mode === "server"
  const [globalFilter, setGlobalFilter] = useState("")
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const notReady = isLoading || error !== null

  const searchValue = isServerMode ? serverPagination.search : globalFilter

  const table = useTable({
    features: appTableFeatures,
    data,
    columns: columns as Array<ColumnDef<AppTableFeatures, TData>>,
    getRowId,
    enableRowSelection: true,
    getRowCanExpand: getRowCanExpand
      ? (row) => getRowCanExpand(row.original)
      : undefined,
    manualSorting: !enableSorting,
    manualFiltering: isServerMode,
    manualPagination: isServerMode || !enablePagination,
    rowCount: isServerMode ? serverPagination.rowCount : undefined,
    ...(isServerMode
      ? { onPaginationChange: serverPagination.onPaginationChange }
      : {}),
    onGlobalFilterChange: isServerMode ? undefined : setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    globalFilterFn: isServerMode ? undefined : "includesString",
    state: {
      ...(isServerMode
        ? { pagination: serverPagination.pagination }
        : { globalFilter }),
      rowSelection,
      sorting,
      expanded,
    },
    initialState:
      enablePagination && !isServerMode
        ? {
            pagination: {
              pageIndex: 0,
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
      <DataTableToolbar
        disabled={notReady}
        enablePagination={enablePagination}
        searchLabel={searchLabel}
        searchValue={searchValue}
        serverPagination={serverPagination}
        table={table}
      />
      <DataTableContent
        columns={columns}
        emptyMessage={emptyMessage}
        error={error}
        ExpandedRowComponent={ExpandedRowComponent}
        isLoading={isLoading}
        table={table}
      />
      {enablePagination ? (
        <DataTablePagination
          table={table}
          showSelectionSummary={showSelectionSummary}
        />
      ) : null}
      <DataTableSelectionBar
        clearSelection={clearSelection}
        selectedRows={selectedRows}
        selectionActions={selectionActions}
      />
    </div>
  )
}
