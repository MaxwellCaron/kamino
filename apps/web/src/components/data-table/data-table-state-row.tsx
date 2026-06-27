import { TableCell, TableRow } from "@workspace/ui/components/table"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"

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
      <TableCell colSpan={colSpan} className="h-24">
        {error ? (
          <InlineErrorAlert error={error} fallback="Failed to load table data." />
        ) : (
          <div className="text-center">{emptyMessage}</div>
        )}
      </TableCell>
    </TableRow>
  )
}
