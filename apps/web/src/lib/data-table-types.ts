import type {
  CellData,
  OnChangeFn,
  PaginationState,
  RowData,
  TableFeatures,
} from "@tanstack/react-table"
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createExpandedRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from "@tanstack/react-table"

export const appTableFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowExpandingFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  sortFns,
  filterFns,
})

export type AppTableFeatures = typeof appTableFeatures

declare module "@tanstack/react-table" {
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    className?: string
  }
}

export type DataTableSelectionActionsContext<TData> = {
  clearSelection: () => void
  selectedRows: Array<TData>
}

export type DataTableFeatures = {
  loading?: boolean
  pagination?: boolean
  sorting?: boolean
  selectionSummary?: boolean
}

export const defaultDataTableFeatures: Required<DataTableFeatures> = {
  loading: false,
  pagination: true,
  sorting: false,
  selectionSummary: true,
}

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
