import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  InventoryMenuEmptyState,
  InventoryNodeMenuBody,
} from "@/components/inventory/actions/inventory-node-menu-body"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import { Button } from "@workspace/ui/components/button"
import type { FolderPowerTargets } from "@/features/inventory/utils/inventory-power-actions"
import { HugeiconsIcon } from "@hugeicons/react"
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { collectFolderPowerTargets } from "@/features/inventory/utils/inventory-power-actions"
import { hasNodeActions } from "@/features/inventory/utils/inventory-capabilities"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { stopTreeItemEvent } from "@/components/inventory/actions/inventory-action-utils"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSidebar } from "@workspace/ui/components/sidebar"

const EMPTY_FOLDER_POWER: FolderPowerTargets = {
  targets: [],
  canPower: false,
}

export function InventoryNodeMenu({
  itemId,
  data,
  className,
  iconSize = "icon-xs",
  contentAlign,
  canPower,
  open,
  onOpenChange,
}: {
  itemId: string
  data: ApiTreeNode
  className?: string
  iconSize?: "icon-xs" | "icon-sm" | "icon" | "icon-lg"
  contentAlign?: "start" | "center" | "end"
  canPower?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  if (canPower !== undefined) {
    return (
      <InventoryNodeMenuWithPrecomputedPower
        itemId={itemId}
        data={data}
        className={className}
        iconSize={iconSize}
        contentAlign={contentAlign}
        canPower={canPower}
        open={open}
        onOpenChange={onOpenChange}
      />
    )
  }

  return (
    <InventoryNodeMenuSelfQuerying
      itemId={itemId}
      data={data}
      className={className}
      iconSize={iconSize}
      contentAlign={contentAlign}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

function InventoryNodeMenuSelfQuerying({
  itemId,
  data,
  className,
  iconSize,
  contentAlign,
  open,
  onOpenChange,
}: {
  itemId: string
  data: ApiTreeNode
  className?: string
  iconSize: "icon-xs" | "icon-sm" | "icon" | "icon-lg"
  contentAlign?: "start" | "center" | "end"
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { data: tree } = useQuery(inventoryTreeQueryOptions)
  const folderPower = useMemo(
    () =>
      data.kind === "folder"
        ? collectFolderPowerTargets(tree ?? [], itemId)
        : EMPTY_FOLDER_POWER,
    [data.kind, itemId, tree]
  )

  if (tree?.length === 0) {
    return (
      <InventoryNodeMenuDropdown
        data={data}
        className={className}
        iconSize={iconSize}
        contentAlign={contentAlign}
        canPower={false}
        open={open}
        onOpenChange={onOpenChange}
      >
        <InventoryMenuEmptyState />
      </InventoryNodeMenuDropdown>
    )
  }

  return (
    <InventoryNodeMenuDropdown
      data={data}
      className={className}
      iconSize={iconSize}
      contentAlign={contentAlign}
      canPower={folderPower.canPower}
      open={open}
      onOpenChange={onOpenChange}
    >
      <InventoryNodeMenuBody
        itemId={itemId}
        data={data}
        folderPower={folderPower}
      />
    </InventoryNodeMenuDropdown>
  )
}

function InventoryNodeMenuWithPrecomputedPower({
  itemId,
  data,
  className,
  iconSize,
  contentAlign,
  canPower,
  open,
  onOpenChange,
}: {
  itemId: string
  data: ApiTreeNode
  className?: string
  iconSize: "icon-xs" | "icon-sm" | "icon" | "icon-lg"
  contentAlign?: "start" | "center" | "end"
  canPower: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const body =
    data.kind === "folder" ? (
      <LazyFolderPowerBody itemId={itemId} data={data} />
    ) : (
      <InventoryNodeMenuBody
        itemId={itemId}
        data={data}
        folderPower={EMPTY_FOLDER_POWER}
      />
    )

  return (
    <InventoryNodeMenuDropdown
      data={data}
      className={className}
      iconSize={iconSize}
      contentAlign={contentAlign}
      canPower={canPower}
      open={open}
      onOpenChange={onOpenChange}
    >
      {body}
    </InventoryNodeMenuDropdown>
  )
}

function InventoryNodeMenuDropdown({
  data,
  className,
  iconSize = "icon-xs",
  contentAlign,
  canPower,
  open,
  onOpenChange,
  children,
}: {
  data: ApiTreeNode
  className?: string
  iconSize?: "icon-xs" | "icon-sm" | "icon" | "icon-lg"
  contentAlign?: "start" | "center" | "end"
  canPower: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const { isMobile } = useSidebar()

  if (!hasNodeActions(data, canPower)) return null

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
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
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LazyFolderPowerBody({
  itemId,
  data,
}: {
  itemId: string
  data: ApiTreeNode
}) {
  const { data: tree } = useQuery(inventoryTreeQueryOptions)
  const folderPower = useMemo(
    () => collectFolderPowerTargets(tree ?? [], itemId),
    [itemId, tree]
  )

  return (
    <InventoryNodeMenuBody
      itemId={itemId}
      data={data}
      folderPower={folderPower}
    />
  )
}
