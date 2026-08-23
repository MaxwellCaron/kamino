import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon, Copy02Icon, CubeIcon } from "@hugeicons/core-free-icons"

import { getVmPowerStatusDotClassName } from "./vm-power-status"

export function VmIcon({
  status,
  isTemplate,
  guestType,
}: {
  status: string | undefined
  isTemplate?: boolean
  guestType?: "qemu" | "lxc"
}) {
  if (isTemplate) {
    return (
      <HugeiconsIcon
        icon={Copy02Icon}
        className="size-4 text-muted-foreground"
      />
    )
  }

  const glyph = guestType === "lxc" ? CubeIcon : ComputerIcon
  const color = getVmPowerStatusDotClassName(status)

  return (
    <span className="relative">
      <HugeiconsIcon icon={glyph} className="size-4 text-muted-foreground" />
      {color && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-background ${color}`}
          title={status}
        />
      )}
    </span>
  )
}
