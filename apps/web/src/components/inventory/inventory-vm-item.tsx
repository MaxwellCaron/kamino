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
import { formatMemory } from "@/features/shared/utils/format"

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
  preventNavigationFromTrailingContent?: boolean
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
        {memoryMb != null ? formatMemory(memoryMb) : "—"}
      </div>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex items-center gap-1">
        <HugeiconsIcon icon={HardDriveIcon} className="size-3.5" />
        {diskGb != null ? `${diskGb} GB` : "—"}
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
  preventNavigationFromTrailingContent = false,
}: InventoryVmItemProps) {
  return (
    <Item
      className="group/folder-row flex-nowrap"
      render={
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
          {trailingContent ? (
            <ItemActions
              className="gap-0.5"
              onClickCapture={
                preventNavigationFromTrailingContent
                  ? (event) => {
                      if (event.currentTarget.contains(event.target as Node)) {
                        event.preventDefault()
                      }
                    }
                  : undefined
              }
            >
              {trailingContent}
            </ItemActions>
          ) : null}
        </Link>
      }
    />
  )
}
