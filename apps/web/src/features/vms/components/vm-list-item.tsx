import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Clock01Icon, ExternalLinkIcon } from "@hugeicons/core-free-icons"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"
import {
  VmIcon,
  formatVmPowerStatus,
  getVmPowerStatusTextClassName,
} from "@/components/status/vm-icon"
import { formatUptime } from "@/features/shared/utils/format"

export function VmListItem({
  isTemplate = false,
  itemId,
  name,
  openInNewTab = false,
  status,
  uptime,
}: {
  isTemplate?: boolean
  itemId: string
  name: string
  openInNewTab?: boolean
  status?: string
  uptime?: number
}) {
  const statusLabel = isTemplate ? "Template" : (status ?? "VM")

  return (
    <Item
      variant="muted"
      className="cursor-pointer"
      render={
        <Link
          to="/inventory/items/$itemId"
          target={openInNewTab ? "_blank" : undefined}
          rel={openInNewTab ? "noreferrer" : undefined}
          params={{ itemId }}
        >
          <ItemMedia variant="icon">
            <VmIcon status={status} isTemplate={isTemplate} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-sm font-medium">{name}</ItemTitle>
            <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "font-medium",
                  !isTemplate && status
                    ? getVmPowerStatusTextClassName(status)
                    : null
                )}
              >
                {isTemplate || !status
                  ? statusLabel
                  : formatVmPowerStatus(status)}
              </span>
              {!isTemplate && status === "running" && uptime != null && (
                <>
                  <span aria-hidden="true">•</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <HugeiconsIcon icon={Clock01Icon} className="size-3.5" />
                    {formatUptime(uptime)}
                  </span>
                </>
              )}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <HugeiconsIcon
              icon={ExternalLinkIcon}
              className="size-4 text-muted-foreground"
            />
          </ItemActions>
        </Link>
      }
    />
  )
}
