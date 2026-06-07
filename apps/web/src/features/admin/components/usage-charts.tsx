import { useMemo } from "react"
import { Area, AreaChart } from "@workspace/ui/components/charts/area-chart"
import { Grid } from "@workspace/ui/components/charts/grid"
import {
  ChartTooltip,
  TooltipContent,
} from "@workspace/ui/components/charts/tooltip"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { XAxis } from "@workspace/ui/components/charts/x-axis"
import { formatPercent, percentage } from "../utils/admin-dashboard"
import type { ClusterUsageHistoryTimeframe } from "../api/admin-metrics-api"
import { formatBytes } from "@/features/shared/utils/format"

type CapacityHistoryPoint = {
  date: Date
  value: number
  used: number
  total: number
}

function getXAxisConfig(timeframe: ClusterUsageHistoryTimeframe) {
  switch (timeframe) {
    case "hour":
      return {
        numTicks: 4,
        tickerHalfWidth: 26,
        formatLabel: (date: Date) =>
          date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          }),
      }
    case "day":
      return {
        numTicks: 4,
        tickerHalfWidth: 28,
        formatLabel: (date: Date) =>
          date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          }),
      }
    case "month":
      return {
        numTicks: 5,
        tickerHalfWidth: 38,
        formatLabel: (date: Date) =>
          date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
      }
    case "week":
      return {
        numTicks: 4,
        tickerHalfWidth: 34,
        formatLabel: (date: Date) =>
          date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
      }
  }
}

function formatTooltipTitle(dateValue: unknown) {
  const date =
    dateValue instanceof Date ? dateValue : new Date(String(dateValue))

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function UsageAreaChart({
  label,
  used,
  total,
  color,
  timeframe,
  history,
  isLoading = false,
  unavailableMessage = "History unavailable.",
  formatValue = formatBytes,
}: {
  label: string
  used: number
  total: number
  color: string
  timeframe: ClusterUsageHistoryTimeframe
  history: Array<CapacityHistoryPoint>
  isLoading?: boolean
  unavailableMessage?: string
  formatValue?: (v: number) => string
}) {
  const percent = percentage(used, total)
  const chartData = useMemo(
    () =>
      history.map((point) => ({
        date: point.date,
        value: point.value,
        used: point.used,
        total: point.total,
      })),
    [history]
  )
  const xAxisConfig = useMemo(() => getXAxisConfig(timeframe), [timeframe])

  return (
    <section className="grid min-w-0 gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <h3 className="text-sm font-semibold">{label}</h3>
          </div>
        </div>
        <div className="text-right leading-none">
          <div className="scroll-m-20 text-2xl font-semibold tracking-tight tabular-nums">
            {formatPercent(percent)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatValue(used)} / {formatValue(total)}
          </div>
        </div>
      </div>

      <div className="min-w-0">
        {isLoading ? (
          <Skeleton
            className="w-full rounded-lg"
            style={{
              aspectRatio:
                timeframe === "hour" || timeframe === "day"
                  ? "2.8 / 1"
                  : "2.4 / 1",
            }}
          />
        ) : chartData.length > 0 ? (
          <AreaChart
            aspectRatio={
              timeframe === "hour" || timeframe === "day"
                ? "2.8 / 1"
                : "2.4 / 1"
            }
            data={chartData}
            margin={{ top: 8, right: 6, bottom: 28, left: 6 }}
          >
            <Grid
              fadeHorizontal={false}
              numTicksRows={3}
              strokeDasharray="3,3"
              strokeOpacity={0.5}
            />
            <Area
              dataKey="value"
              fadeEdges
              fill={color}
              fillOpacity={0.2}
              gradientToOpacity={0.02}
              showHighlight={false}
              stroke={color}
              strokeWidth={2}
            />
            <XAxis
              formatLabel={xAxisConfig.formatLabel}
              numTicks={xAxisConfig.numTicks}
              tickerHalfWidth={xAxisConfig.tickerHalfWidth}
            />
            <ChartTooltip
              content={({ point }) => (
                <TooltipContent
                  rows={[
                    {
                      color,
                      label,
                      value: `${formatPercent(Number(point.value ?? 0))} · ${formatValue(Number(point.used ?? 0))} / ${formatValue(Number(point.total ?? 0))}`,
                    },
                  ]}
                  title={formatTooltipTitle(point.date)}
                />
              )}
              showDatePill={false}
            />
          </AreaChart>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 text-center text-sm text-muted-foreground">
            {unavailableMessage}
          </div>
        )}
      </div>
    </section>
  )
}
