import { TableCell, TableRow } from "@workspace/ui/components/table"

type DataTableStateRowProps = {
  colSpan: number
  error: Error | null
  emptyMessage?: string
}

export function DataTableStateRow({
  colSpan,
  error,
  emptyMessage = "No results.",
}: DataTableStateRowProps) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={`h-24 text-center ${error !== null ? "text-destructive" : ""}`}
      >
        {error ? error.message : emptyMessage}
      </TableCell>
    </TableRow>
  )
}
