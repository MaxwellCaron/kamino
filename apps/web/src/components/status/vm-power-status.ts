export function formatVmPowerStatus(status?: string): string {
  if (!status) return "—"
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function getVmPowerStatusTextClassName(
  status?: string
): string | undefined {
  if (status === "running") return "text-emerald-600 dark:text-emerald-400"
  if (status === "stopped") return "text-destructive"
  if (status) return "text-amber-600 dark:text-amber-400"
  return undefined
}

export function getVmPowerStatusDotClassName(
  status?: string
): string | undefined {
  if (status === "running") return "bg-emerald-600 dark:bg-emerald-400"
  if (status === "stopped") return "bg-muted-foreground/40"
  if (status) return "bg-amber-600 dark:bg-amber-400"
  return undefined
}

export function getVmPowerStatusSurfaceClassName(
  status?: string
): string | undefined {
  if (status === "running") return "bg-emerald-600/5 dark:bg-emerald-400/5"
  if (status === "stopped") return "bg-destructive/5"
  return undefined
}
