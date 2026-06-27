import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { buttonVariants } from "@workspace/ui/components/button"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import { SimpleDataTable } from "@/components/data-table/simple-data-table"

type AdminDashboardPendingRequestsCardProps = {
  columns: Array<ColumnDef<ApiRequestSummary>>
  data: Array<ApiRequestSummary>
  error: Error | null
  isLoading: boolean
}

export function AdminDashboardPendingRequestsCard({
  columns,
  data,
  error,
  isLoading,
}: AdminDashboardPendingRequestsCardProps) {
  return (
    <Card className="xl:col-span-7">
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Pending Requests
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Newest requests waiting for review.
        </CardDescription>
        <CardAction>
          <Link to="/manager/requests" className={buttonVariants()}>
            Queue
            <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <SimpleDataTable
          columns={columns}
          data={data}
          error={error}
          getRowId={(request: ApiRequestSummary) => request.id}
          isLoading={isLoading}
          skeletonRows={3}
        />
      </CardContent>
    </Card>
  )
}
