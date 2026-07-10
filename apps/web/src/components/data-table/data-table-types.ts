import type { RowData } from "@tanstack/react-table"

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
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
