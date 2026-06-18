import { useMemo } from "react"
import { Area, AreaChart } from "@workspace/ui/components/charts/area-chart"
import { Grid } from "@workspace/ui/components/charts/grid"
import {
  ChartTooltip,
  TooltipContent,
} from "@workspace/ui/components/charts/tooltip"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { XAxis } from "@workspace/ui/components/charts/x-axis"
import {
  formatPercent,
  formatUsageBytes,
  percentage,
} from "../utils/admin-dashboard"
import type { UsageHistoryTimeframe } from "../api/admin-metrics-api"
import type { CapacityHistoryPoint } from "../utils/admin-dashboard"

function getXAxisConfig(timeframe: UsageHistoryTimeframe) {
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

function getClusterAspectRatio(timeframe: UsageHistoryTimeframe) {
  return timeframe === "hour" || timeframe === "day" ? "2.8 / 1" : "2.4 / 1"
}

function getNodeAspectRatio(_timeframe: UsageHistoryTimeframe) {
  return "5 / 1"
}

function UsageChartBody({
  chartData,
  color,
  formatValue,
  label,
  timeframe,
  aspectRatio,
  compact = false,
  showXAxis = true,
}: {
  chartData: Array<CapacityHistoryPoint>
  color: string
  formatValue: (value: number) => string
  label: string
  timeframe: UsageHistoryTimeframe
  aspectRatio: string
  compact?: boolean
  showXAxis?: boolean
}) {
  const xAxisConfig = useMemo(() => getXAxisConfig(timeframe), [timeframe])
  const margin = compact
    ? showXAxis
      ? { top: 4, right: 6, bottom: 18, left: 6 }
      : { top: 4, right: 6, bottom: 4, left: 6 }
    : { top: 8, right: 6, bottom: 28, left: 6 }

  return (
    <AreaChart
      aspectRatio={aspectRatio}
      className={compact ? "overflow-hidden" : undefined}
      data={chartData}
      margin={margin}
    >
      <Grid
        fadeHorizontal={false}
        numTicksRows={compact ? 2 : 3}
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
        strokeWidth={compact ? 1.5 : 2}
      />
      {showXAxis ? (
        <XAxis
          formatLabel={xAxisConfig.formatLabel}
          numTicks={compact ? 2 : xAxisConfig.numTicks}
          tickerHalfWidth={compact ? 18 : xAxisConfig.tickerHalfWidth}
        />
      ) : null}
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
  )
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
  formatValue = formatUsageBytes,
}: {
  label: string
  used: number
  total: number
  color: string
  timeframe: UsageHistoryTimeframe
  history: Array<CapacityHistoryPoint>
  isLoading?: boolean
  unavailableMessage?: string
  formatValue?: (value: number) => string
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
  const aspectRatio = getClusterAspectRatio(timeframe)

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
          <Skeleton className="w-full rounded-lg" style={{ aspectRatio }} />
        ) : chartData.length > 0 ? (
          <UsageChartBody
            aspectRatio={aspectRatio}
            chartData={chartData}
            color={color}
            formatValue={formatValue}
            label={label}
            timeframe={timeframe}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 text-center text-sm text-muted-foreground">
            {unavailableMessage}
          </div>
        )}
      </div>
    </section>
  )
}

export function NodeUsageAreaChart({
  label,
  used,
  total,
  color,
  timeframe,
  history,
  isLoading = false,
  unavailableMessage = "No history",
  formatValue = formatUsageBytes,
}: {
  label: string
  used: number
  total: number
  color: string
  timeframe: UsageHistoryTimeframe
  history: Array<CapacityHistoryPoint>
  isLoading?: boolean
  unavailableMessage?: string
  formatValue?: (value: number) => string
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
  const aspectRatio = getNodeAspectRatio(timeframe)

  const usageLabel = `${formatValue(used)} / ${formatValue(total)}`

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="grid min-h-4 grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-2 text-xs leading-none">
        <span className="truncate text-muted-foreground" title={usageLabel}>
          {usageLabel}
        </span>
        <span className="text-right tabular-nums">
          {formatPercent(percent)}
        </span>
      </div>
      <div className="w-full overflow-hidden">
        {isLoading ? (
          <Skeleton className="w-full rounded-md" style={{ aspectRatio }} />
        ) : chartData.length > 0 ? (
          <UsageChartBody
            aspectRatio={aspectRatio}
            chartData={chartData}
            color={color}
            compact
            formatValue={formatValue}
            label={label}
            showXAxis={false}
            timeframe={timeframe}
          />
        ) : (
          <div
            className="flex w-full items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 px-2 text-center text-xs text-muted-foreground"
            style={{ aspectRatio }}
          >
            {unavailableMessage}
          </div>
        )}
      </div>
    </div>
  )
}
