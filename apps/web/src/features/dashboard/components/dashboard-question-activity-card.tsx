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
  levelStylesFromColors,
} from "@workspace/ui/components/charts/heatmap"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"
import type { HeatmapColumn } from "@workspace/ui/components/charts/heatmap"

const questionActivityLevelColors = [
  "var(--color-muted)",
  "#0e4429",
  "#006d32",
  "#26a641",
  "#39d353",
] as const

const questionActivityLevelStyles = levelStylesFromColors(
  questionActivityLevelColors
)

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
      <CardContent className="-mx-4 min-w-0">
        {error ? (
          <Empty className="min-h-48 border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Could not load question activity</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <HeatmapInteractionProvider>
            <HeatmapInteractionBoundary className="flex w-full flex-col items-stretch">
              <HeatmapChart
                data={data}
                gap={3}
                animate={false}
                layout="fluid"
                levelColors={questionActivityLevelColors}
              >
                <HeatmapCells
                  cornerRadius={999}
                  inactiveOpacity={1}
                  inactiveScale={1}
                />
                <HeatmapXAxis />
                <HeatmapYAxis tickFilter="all" labelFormat="initial" />
                <HeatmapTooltip instant />
              </HeatmapChart>
              <HeatmapLegend
                align="center"
                cornerRadius={999}
                gap={5}
                inactiveOpacity={1}
                inactiveScale={1}
                levelStyles={questionActivityLevelStyles}
                className="pt-4"
              />
            </HeatmapInteractionBoundary>
          </HeatmapInteractionProvider>
        )}
      </CardContent>
    </Card>
  )
}
