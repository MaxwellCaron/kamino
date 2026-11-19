import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { ApiRequestSummary } from "@/lib/requests/request-types"
import { DataTable } from "@/components/data-table/data-table"
import { cn } from "@workspace/ui/lib/utils"
import type { getDashboardActivityColumns } from "@/components/dashboard/dashboard-requests-columns"

export function DashboardActivityTableCard({
  className,
  columns,
  data,
  error,
}: {
  className?: string
  columns: ReturnType<typeof getDashboardActivityColumns>
  data: Array<ApiRequestSummary>
  error: Error | null
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Activity
        </CardTitle>
        <CardDescription>
          Complete request history for your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="w-full px-0">
        <DataTable
          columns={columns}
          data={data}
          error={error}
          initialPageSize={10}
          searchLabel="Search requests"
          getRowId={(request: ApiRequestSummary) => request.id}
        />
      </CardContent>
    </Card>
  )
}
