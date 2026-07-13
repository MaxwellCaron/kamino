import { HugeiconsIcon } from "@hugeicons/react"
import { GitPullRequestIcon } from "@hugeicons/core-free-icons"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { PieChart } from "@workspace/ui/components/charts/pie-chart"
import { PieSlice } from "@workspace/ui/components/charts/pie-slice"
import { PieCenter } from "@workspace/ui/components/charts/pie-center"
import { cn } from "@workspace/ui/lib/utils"
import type { ApiRequestStatus } from "@/features/requests/types/request-types"
import {
  STATUS_ICONS,
  formatRequestStatus,
  getRequestStatusClassName,
} from "@/features/requests/utils/request-presenters"

type RequestsPageOverviewCardProps = {
  statusCounts: Record<ApiRequestStatus, number>
  chartData: Array<{
    label: string
    value: number
    className: string
  }>
}

export function RequestsPageOverviewCard({
  statusCounts,
  chartData,
}: RequestsPageOverviewCardProps) {
  return (
    <Card className="overflow-hidden border-border/70 bg-linear-to-br from-card via-card to-muted/50">
      <CardHeader className="gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-2xl flex-col gap-3">
            <CardTitle className="flex items-center gap-2 text-4xl font-black tracking-tight">
              <HugeiconsIcon
                icon={GitPullRequestIcon}
                className="size-7 text-muted-foreground"
              />
              Requests
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm/relaxed">
              Managers and administrators review queued user requests.
            </CardDescription>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="col-span-3 grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-3 lg:gap-6">
            {(
              [
                "pending",
                "approved",
                "denied",
                "executed",
                "execution_failed",
              ] as Array<ApiRequestStatus>
            ).map((status) => {
              const StatusIcon = STATUS_ICONS[status]

              return (
                <Item
                  key={status}
                  variant="muted"
                  className={cn(status === "pending" && "col-span-2")}
                >
                  <ItemMedia
                    className={cn(
                      "size-6 rounded-full border-transparent!",
                      getRequestStatusClassName(status)
                    )}
                  >
                    <HugeiconsIcon icon={StatusIcon} className="size-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{formatRequestStatus(status)}</ItemTitle>
                  </ItemContent>
                  <ItemFooter>
                    <div>
                      <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
                        {statusCounts[status]}
                      </h3>
                    </div>
                  </ItemFooter>
                </Item>
              )
            })}
          </div>
          <div className="col-span-3 lg:col-span-1">
            <Card className="h-full bg-muted/50 shadow-none ring-0">
              <CardContent className="flex h-full items-center justify-center">
                <PieChart data={chartData} size={200} innerRadius={60}>
                  {chartData.map((item, index) => (
                    <PieSlice key={item.label} index={index} />
                  ))}
                  <PieCenter defaultLabel="Requests" />
                </PieChart>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}
