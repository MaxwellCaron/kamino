import { Link } from "@tanstack/react-router"
import {
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconFolder,
  IconStar,
  IconTopologyBus,
} from "@tabler/icons-react"
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
import { InventoryNodeMenu } from "../inventory-actions"
import type { ApiTreeNode } from "../../types/inventory-types"
import { VmIcon } from "@/components/status/vm-icon"
import { formatMemory } from "@/features/shared/utils/format"

function FolderDescription({ node }: { node: ApiTreeNode }) {
  const children = node.children ?? []
  const folderCount = children.filter((child) => child.kind === "folder").length
  const vmCount = children.filter((child) => child.kind === "vm").length

  return (
    <>
      <div className="flex items-center gap-1">
        <IconFolder className="size-3.5" />
        {folderCount} {folderCount === 1 ? "Folder" : "Folders"}
      </div>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex items-center gap-1">
        <IconDeviceDesktop className="size-3.5" />
        {vmCount} {vmCount === 1 ? "VM" : "VMs"}
      </div>
    </>
  )
}

function VmDescription({ vm }: { vm: ApiTreeNode["vm"] }) {
  return (
    <>
      <div className="flex items-center gap-1">
        <IconCpu className="size-3.5" />
        {vm?.cpu_count != null
          ? `${vm.cpu_count} CPU${vm.cpu_count === 1 ? "" : "s"}`
          : "—"}
      </div>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex items-center gap-1">
        <IconTopologyBus className="size-3.5 rotate-180" />
        {vm?.memory_mb != null ? formatMemory(vm.memory_mb) : "—"}
      </div>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex items-center gap-1">
        <IconDatabase className="size-3.5" />
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
  const isTemplate = !isFolder && (node.vm?.is_template ?? false)

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
            {isFolder ? (
              <IconFolder className="fill-amber-600/20 text-amber-600 dark:fill-amber-400/20 dark:text-amber-400" />
            ) : (
              <VmIcon status={status} isTemplate={isTemplate} />
            )}
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{node.name}</ItemTitle>
            <ItemDescription className="flex items-center gap-2 **:text-xs">
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
              <IconStar
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
