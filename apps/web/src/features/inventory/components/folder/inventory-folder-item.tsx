import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ComputerIcon,
  CpuIcon,
  FolderIcon,
  HardDriveIcon,
  RamMemoryIcon,
  StarIcon,
} from "@hugeicons/core-free-icons"
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

function VmDescription({ vm }: { vm: ApiTreeNode["vm"] }) {
  return (
    <>
      <div className="flex items-center gap-1">
        <HugeiconsIcon icon={CpuIcon} className="size-3.5" />
        {vm?.cpu_count != null
          ? `${vm.cpu_count} CPU${vm.cpu_count === 1 ? "" : "s"}`
          : "—"}
      </div>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex items-center gap-1">
        <HugeiconsIcon icon={RamMemoryIcon} className="size-3.5" />
        {vm?.memory_mb != null ? formatMemory(vm.memory_mb) : "—"}
      </div>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex items-center gap-1">
        <HugeiconsIcon icon={HardDriveIcon} className="size-3.5" />
        {vm?.disk_gb != null ? `${vm.disk_gb} GB` : "—"}
      </div>
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
  const isFolder = node.kind === "folder"

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
              {isFolder ? (
                <FolderDescription node={node} />
              ) : (
                <VmDescription vm={node.vm} />
              )}
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
                  isFavorite
                    ? "fill-muted-foreground dark:fill-muted-foreground"
                    : ""
                }
              />
            </Button>
            <InventoryNodeMenu itemId={node.id} data={node} iconSize="icon" />
          </ItemActions>
        </Link>
      }
    />
  )
}
