import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon, Layout01Icon } from "@hugeicons/core-free-icons"

export function VmIcon({
  status,
  isTemplate,
}: {
  status: string | undefined
  isTemplate?: boolean
}) {
  if (isTemplate) {
    return (
      <HugeiconsIcon
        icon={Layout01Icon}
        className="size-4 text-muted-foreground"
      />
    )
  }

  const color = getVmPowerStatusDotClassName(status)

  return (
    <span className="relative">
      <HugeiconsIcon
        icon={ComputerIcon}
        className="size-4 text-muted-foreground"
      />
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
  if (status === "running") return "text-emerald-600 dark:text-emerald-400"
  if (status === "stopped") return "text-destructive"
  if (status) return "text-amber-600 dark:text-amber-400"
  return undefined
}

function getVmPowerStatusDotClassName(status?: string): string | undefined {
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
