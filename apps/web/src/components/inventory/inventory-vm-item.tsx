import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CpuIcon,
  HardDriveIcon,
  RamMemoryIcon,
} from "@hugeicons/core-free-icons"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Separator } from "@workspace/ui/components/separator"
import type { ReactNode } from "react"
import { VmIcon } from "@/components/status/vm-icon"

function formatVmRowMemoryMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}

function formatVmRowDiskGb(gb: number): string {
  return `${gb.toFixed(1)} GB`
}

export type InventoryVmItemProps = {
  itemId: string
  name: string
  status?: string
  guestType?: "qemu" | "lxc"
  isTemplate?: boolean
  cpuCount?: number
  memoryMb?: number
  diskGb?: number
  openInNewTab?: boolean
  trailingContent?: ReactNode
}

function VmResourceDescription({
  cpuCount,
  memoryMb,
  diskGb,
}: {
  cpuCount?: number
  memoryMb?: number
  diskGb?: number
}) {
  return (
    <>
      <div className="flex items-center gap-1">
        <HugeiconsIcon icon={CpuIcon} className="size-3.5" />
        {cpuCount != null ? `${cpuCount} CPU${cpuCount === 1 ? "" : "s"}` : "—"}
      </div>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex items-center gap-1">
        <HugeiconsIcon icon={RamMemoryIcon} className="size-3.5" />
        {memoryMb != null ? formatVmRowMemoryMb(memoryMb) : "—"}
      </div>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex items-center gap-1">
        <HugeiconsIcon icon={HardDriveIcon} className="size-3.5" />
        {diskGb != null ? formatVmRowDiskGb(diskGb) : "—"}
      </div>
    </>
  )
}

export function InventoryVmItem({
  itemId,
  name,
  status,
  guestType,
  isTemplate,
  cpuCount,
  memoryMb,
  diskGb,
  openInNewTab = false,
  trailingContent,
}: InventoryVmItemProps) {
  return (
    <Item className="group/folder-row flex-nowrap hover:bg-muted [&_a]:hover:bg-transparent">
      <Link
        to="/inventory/items/$itemId"
        params={{ itemId }}
        target={openInNewTab ? "_blank" : undefined}
        rel={openInNewTab ? "noreferrer" : undefined}
        aria-label={openInNewTab ? `Open ${name} in a new tab` : undefined}
        className="flex min-w-0 flex-1 items-center gap-3.5"
      >
        <ItemMedia variant="icon">
          <VmIcon
            status={status}
            isTemplate={isTemplate}
            guestType={guestType}
          />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{name}</ItemTitle>
          <ItemDescription className="flex items-center gap-2">
            <VmResourceDescription
              cpuCount={cpuCount}
              memoryMb={memoryMb}
              diskGb={diskGb}
            />
          </ItemDescription>
        </ItemContent>
      </Link>
      {trailingContent ? (
        <ItemActions className="shrink-0 gap-0.5">
          {trailingContent}
        </ItemActions>
      ) : null}
    </Item>
  )
}
