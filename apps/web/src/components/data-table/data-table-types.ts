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
