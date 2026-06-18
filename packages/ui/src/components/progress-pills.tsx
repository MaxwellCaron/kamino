export function ProgressPills({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 100 }).map((_, i) => {
        const incomplete = i > Math.round(progress)
        return (
          <span
            key={i}
            className={
              "h-7 w-full rounded-sm " +
              (incomplete ? "bg-foreground/15" : "bg-primary")
            }
          />
        )
      })}
      <p className="pl-2">{progress.toFixed(2)}%</p>
    </div>
  )
}
