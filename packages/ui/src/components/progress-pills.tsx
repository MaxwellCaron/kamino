import { ProgressRoot, ProgressValue } from "@workspace/ui/components/progress"

const PILL_COUNT = 40

export function ProgressPills({ progress }: { progress: number }) {
  const value = Math.min(100, Math.max(0, progress))
  const completedPills = Math.round((value / 100) * PILL_COUNT)
  const formattedValue = `${value.toFixed(2)}%`

  return (
    <ProgressRoot
      aria-label="Progress"
      aria-valuetext={formattedValue}
      className="flex min-w-0 items-center gap-2"
      value={value}
    >
      <div aria-hidden="true" className="flex min-w-0 flex-1 gap-1">
        {Array.from({ length: PILL_COUNT }, (_, index) => (
          <span
            key={index}
            className="h-7 min-w-1 flex-1 rounded-full bg-foreground/5 data-[state=complete]:bg-primary dark:bg-foreground/10"
            data-slot="progress-pill"
            data-state={index < completedPills ? "complete" : "incomplete"}
          />
        ))}
      </div>
      <ProgressValue className="shrink-0">{() => formattedValue}</ProgressValue>
    </ProgressRoot>
  )
}
