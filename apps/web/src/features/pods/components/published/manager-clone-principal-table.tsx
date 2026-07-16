import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import type {
  ColumnDef,
  OnChangeFn,
  RowSelectionState,
} from "@tanstack/react-table"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"

interface ManagerClonePrincipalTableProps {
  columns: Array<ColumnDef<PrincipalOption>>
  data: Array<PrincipalOption>
  rowSelection: RowSelectionState
  onRowSelectionChange: OnChangeFn<RowSelectionState>
}

export function ManagerClonePrincipalTable({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
}: ManagerClonePrincipalTableProps) {
  const table = useReactTable({
    data,
    columns,
    enableRowSelection: true,
    getRowId: (principal) => principal.id,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange,
    state: { rowSelection },
  })

  return (
    <div>
      <Table>
        <TableHeader className="bg-muted hover:bg-muted">
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
        <TableBody>
          {table.getRowModel().rows.length ? (
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
