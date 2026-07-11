import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useSidebar } from "@workspace/ui/components/sidebar"
import { Button } from "@workspace/ui/components/button"
import { inventoryTreeQueryOptions } from "../../api/inventory-api"
import { hasNodeActions } from "../../utils/inventory-capabilities"
import { collectFolderPowerTargets } from "../../utils/inventory-power-actions"
import { stopTreeItemEvent } from "./inventory-action-utils"
import { InventoryNodeMenuBody } from "./inventory-node-menu-body"
import type { ApiTreeNode } from "../../types/inventory-types"

export function InventoryNodeMenu({
  itemId,
  data,
  className,
  iconSize = "icon-xs",
  contentAlign,
}: {
  itemId: string
  data: ApiTreeNode
  className?: string
  iconSize?: "icon-xs" | "icon-sm" | "icon" | "icon-lg"
  contentAlign?: "start" | "center" | "end"
}) {
  const { isMobile } = useSidebar()
  const { data: tree } = useQuery(inventoryTreeQueryOptions)
  const folderPower = useMemo(
    () =>
      data.kind === "folder"
        ? collectFolderPowerTargets(tree ?? [], itemId)
        : { targets: [], canPower: false },
    [data.kind, itemId, tree]
  )

  if (!hasNodeActions(data, folderPower.canPower)) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={iconSize}
            className={className}
            aria-label={`Actions for ${data.name}`}
            onClick={stopTreeItemEvent}
            onPointerDown={stopTreeItemEvent}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} />
          </Button>
        }
      />
      <DropdownMenuContent
        align={contentAlign ?? (isMobile ? "end" : "start")}
        onClick={stopTreeItemEvent}
        onPointerDown={stopTreeItemEvent}
        onKeyDown={stopTreeItemEvent}
      >
        {/* Body renders inside the portal, so its hooks (favorites, dialogs,
            vm-status query) only run once the menu is actually opened. */}
        <InventoryNodeMenuBody
          itemId={itemId}
          data={data}
          folderPower={folderPower}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
