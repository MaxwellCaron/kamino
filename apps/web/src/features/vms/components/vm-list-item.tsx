import { Link } from "@tanstack/react-router"
import { IconClock, IconExternalLink } from "@tabler/icons-react"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"
import { VmIcon } from "@/features/inventory/components/tree/vm-icon"
import { formatUptime } from "@/features/shared/utils/format"

function formatStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getStatusTextClass(status: string) {
  if (status === "running") {
    return "text-green-600 dark:text-green-400"
  }

  if (status === "stopped") {
    return "text-destructive"
  }

  return "text-amber-600 dark:text-amber-400"
}

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
                  !isTemplate && status ? getStatusTextClass(status) : null
                )}
              >
                {isTemplate || !status
                  ? statusLabel
                  : formatStatusLabel(status)}
              </span>
              {!isTemplate && status === "running" && uptime != null && (
                <>
                  <span aria-hidden="true">•</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <IconClock className="size-3.5" />
                    {formatUptime(uptime)}
                  </span>
                </>
              )}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <IconExternalLink className="size-4 text-muted-foreground" />
          </ItemActions>
        </Link>
      }
    />
  )
}
