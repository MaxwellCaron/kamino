import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import type { getDashboardActivityColumns } from "./dashboard-activity-columns"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import { DataTable } from "@/components/data-table/data-table"

export function DashboardActivityTableCard({
  className,
  columns,
  data,
  error,
  isLoading,
}: {
  className?: string
  columns: ReturnType<typeof getDashboardActivityColumns>
  data: Array<ApiRequestSummary>
  error: Error | null
  isLoading: boolean
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Activity
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Complete request history for your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          error={error}
          initialPageSize={5}
          getRowId={(request: ApiRequestSummary) => request.id}
        />
      </CardContent>
    </Card>
  )
}
