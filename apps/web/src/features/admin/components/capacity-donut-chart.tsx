import { useMemo } from "react"
import { PieCenter } from "@workspace/ui/components/charts/pie-center"
import { PieChart } from "@workspace/ui/components/charts/pie-chart"
import { PieSlice } from "@workspace/ui/components/charts/pie-slice"
import { formatBytes } from "@/features/shared/utils/format"

function percentage(used: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (used / total) * 100))
}

export function CapacityChart({
  label,
  used,
  total,
  color,
  formatValue = formatBytes,
}: {
  label: string
  used: number
  total: number
  color: string
  formatValue?: (v: number) => string
}) {
  const percent = percentage(used, total)
  const data = useMemo(
    () => [
      { label: "Used", value: used, color },
      {
        label: "Available",
        value: Math.max(0, total - used),
        color: "var(--muted)",
      },
    ],
    [used, total, color]
  )

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="size-36">
        <PieChart data={data} innerRadius={50} hoverOffset={6}>
          <PieSlice index={0} hoverEffect="grow" />
          <PieSlice index={1} hoverEffect="none" />
          <PieCenter>
            {({ isHovered, value, label: centerLabel }) => (
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold tabular-nums">
                  {isHovered ? formatValue(value) : `${Math.round(percent)}%`}
                </span>
                <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  {isHovered ? centerLabel : label}
                </span>
              </div>
            )}
          </PieCenter>
        </PieChart>
      </div>
      <div className="flex flex-col items-center text-center">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">
          {formatValue(used)} / {formatValue(total)}
        </div>
      </div>
    </div>
  )
}
