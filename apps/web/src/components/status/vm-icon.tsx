import { IconDeviceDesktop, IconTemplate } from "@tabler/icons-react"

export function VmIcon({
  status,
  isTemplate,
}: {
  status: string | undefined
  isTemplate?: boolean
}) {
  if (isTemplate) {
    return <IconTemplate className="size-4 text-muted-foreground" />
  }

  const color = status
    ? status === "running"
      ? "bg-green-600 dark:bg-green-400"
      : status === "stopped"
        ? "bg-muted-foreground/40"
        : "bg-amber-600 dark:bg-amber-400"
    : undefined

  return (
    <span className="relative">
      <IconDeviceDesktop className="size-4 text-muted-foreground" />
      {color && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-background ${color}`}
          title={status}
        />
      )}
    </span>
  )
}

export function formatVmPowerStatus(status?: string): string {
  if (!status) return "—"
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function getVmPowerStatusTextClassName(
  status?: string
): string | undefined {
  if (status === "running") return "text-green-600 dark:text-green-400"
  if (status === "stopped") return "text-destructive"
  if (status) return "text-amber-600 dark:text-amber-400"
  return undefined
}

export function getVmPowerStatusDotClassName(
  status?: string
): string | undefined {
  if (status === "running") return "bg-green-600 dark:bg-green-400"
  if (status === "stopped") return "bg-muted-foreground/40"
  if (status) return "bg-amber-600 dark:bg-amber-400"
  return undefined
}

export function getVmPowerStatusSurfaceClassName(
  status?: string
): string | undefined {
  if (status === "running") return "bg-green-600/5 dark:bg-green-400/5"
  if (status === "stopped") return "bg-destructive/5"
  return undefined
}
