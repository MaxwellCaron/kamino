import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon, FolderIcon, StarIcon } from "@hugeicons/core-free-icons"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import { InventoryNodeMenu } from "../inventory-actions/inventory-node-menu"
import { InventoryNodeIcon } from "../inventory-node-icon"
import type { ApiTreeNode } from "../../types/inventory-types"
import { InventoryVmItem } from "@/components/inventory/inventory-vm-item"
import { formatMemory } from "@/features/shared/utils/format"

function FolderDescription({ node }: { node: ApiTreeNode }) {
  const children = node.children ?? []
  const folderCount = children.filter((child) => child.kind === "folder").length
  const vmCount = children.filter((child) => child.kind === "vm").length

  return (
    <>
      <div className="flex items-center gap-1">
        <HugeiconsIcon icon={FolderIcon} className="size-3.5" />
        {folderCount} {folderCount === 1 ? "Folder" : "Folders"}
      </div>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex items-center gap-1">
        <HugeiconsIcon icon={ComputerIcon} className="size-3.5" />
        {vmCount} {vmCount === 1 ? "VM" : "VMs"}
      </div>
    </>
  )
}

function FolderRowActions({
  itemId,
  node,
  isFavorite,
  onToggleFavorite,
}: {
  itemId: string
  node: ApiTreeNode
  isFavorite: boolean
  onToggleFavorite: () => void
}) {
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className={cn(
          "bg-transparent!",
          isFavorite
            ? "opacity-100!"
            : "opacity-0 transition-opacity group-hover/folder-row:opacity-100"
        )}
        onClick={onToggleFavorite}
      >
        <HugeiconsIcon
          icon={StarIcon}
          className={
            isFavorite ? "fill-muted-foreground dark:fill-muted-foreground" : ""
          }
        />
      </Button>
      <InventoryNodeMenu itemId={itemId} data={node} iconSize="icon" />
    </>
  )
}

export function InventoryFolderItem({
  node,
  status,
  isFavorite,
  onToggleFavorite,
}: {
  node: ApiTreeNode
  status?: string
  isFavorite: boolean
  onToggleFavorite: () => void
}) {
  if (node.kind === "vm") {
    return (
      <InventoryVmItem
        itemId={node.id}
        name={node.name}
        status={status}
        guestType={node.vm?.guest_type}
        isTemplate={node.vm?.is_template}
        cpuCount={node.vm?.cpu_count}
        memoryLabel={
          node.vm?.memory_mb != null
            ? formatMemory(node.vm.memory_mb)
            : undefined
        }
        diskLabel={
          node.vm?.disk_gb != null ? `${node.vm.disk_gb} GB` : undefined
        }
        trailingContent={
          <FolderRowActions
            itemId={node.id}
            node={node}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
          />
        }
        preventNavigationFromTrailingContent
      />
    )
  }

  return (
    <Item
      className="group/folder-row flex-nowrap"
      render={
        <Link
          to="/inventory/items/$itemId"
          params={{ itemId: node.id }}
          className="flex min-w-0 flex-1 items-center gap-3.5"
        >
          <ItemMedia variant="icon">
            <InventoryNodeIcon node={node} status={status} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{node.name}</ItemTitle>
            <ItemDescription className="flex items-center gap-2">
              <FolderDescription node={node} />
            </ItemDescription>
          </ItemContent>
          <ItemActions
            className="gap-0.5"
            onClickCapture={(event) => {
              if (event.currentTarget.contains(event.target as Node)) {
                event.preventDefault()
              }
            }}
          >
            <FolderRowActions
              itemId={node.id}
              node={node}
              isFavorite={isFavorite}
              onToggleFavorite={onToggleFavorite}
            />
          </ItemActions>
        </Link>
      }
    />
  )
}
