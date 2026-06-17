import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapLegend,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
} from "@workspace/ui/components/charts/heatmap"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"
import type { HeatmapColumn } from "@workspace/ui/components/charts/heatmap"

export function DashboardQuestionActivityCard({
  className,
  data,
  error,
}: {
  className?: string
  data: Array<HeatmapColumn>
  error: Error | null
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Question Activity
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Task questions answered by day.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {error ? (
          <Empty className="min-h-48 border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Could not load question activity</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <HeatmapInteractionProvider>
            <HeatmapInteractionBoundary>
              <HeatmapChart data={data} gap={2} layout="fluid" animate={false}>
                <HeatmapCells cornerRadius={999} />
                <HeatmapXAxis />
                <HeatmapYAxis />
                <HeatmapTooltip />
              </HeatmapChart>
              <HeatmapLegend
                align="center"
                cornerRadius={999}
                gap={3}
                className="pt-3"
              />
            </HeatmapInteractionBoundary>
          </HeatmapInteractionProvider>
        )}
      </CardContent>
    </Card>
  )
}
