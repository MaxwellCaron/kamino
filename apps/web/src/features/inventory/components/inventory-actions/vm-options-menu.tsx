import { HugeiconsIcon } from "@hugeicons/react"
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Button } from "@workspace/ui/components/button"
import { useInventoryFavorites } from "../../hooks/use-inventory-favorites"
import { hasFolderActions } from "../../utils/inventory-capabilities"
import { useInventoryDialogs } from "../inventory-dialogs-context"
import { FolderMenuItems } from "./folder-menu-items"
import { TemplateMenuItems } from "./template-menu-items"
import { VmMenuItems } from "./vm-menu-items"
import type { ApiTreeNodePermissions } from "../../types/inventory-types"

export function VmOptionsMenu({
  nodeId,
  itemId,
  permissions,
  isFolder = false,
  isTemplate,
  guestType,
  vmid,
  pveNode,
  name,
  isLoading,
  powerStatus,
}: {
  nodeId: string
  itemId: string
  permissions: ApiTreeNodePermissions
  isFolder?: boolean
  isTemplate?: boolean
  guestType?: "qemu" | "lxc"
  vmid?: number
  pveNode?: string
  name?: string
  isLoading?: boolean
  powerStatus?: string
}) {
  const { favoriteIds, toggleFavorite } = useInventoryFavorites()
  const {
    openConfirm,
    openCreateFolder,
    openRenameFolder,
    openCreateVm,
    openSnapshot,
    openClone,
    openRenameVm,
    openEditVmHardware,
    openPermissions,
  } = useInventoryDialogs()
  const hasActions = isFolder ? hasFolderActions(permissions) : true

  if (!hasActions) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Open actions for ${name ?? (isFolder ? "folder" : "virtual machine")}`}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {isFolder ? (
            <FolderMenuItems
              permissions={permissions}
              power={null}
              onCreateFolder={() => openCreateFolder({ parentId: nodeId })}
              onCreateVm={() => openCreateVm({ initialFolderId: nodeId })}
              onManagePermissions={() =>
                openPermissions({
                  itemId: nodeId,
                  itemKind: "folder",
                  itemName: name ?? "",
                  itemVmid: vmid,
                })
              }
              onEditLimit={() => {}}
              onRename={() =>
                openRenameFolder({
                  folderId: nodeId,
                  currentName: name ?? "",
                })
              }
              onDelete={() => {}}
              isLoading={isLoading}
            />
          ) : isTemplate ? (
            <TemplateMenuItems
              permissions={permissions}
              isFavorite={favoriteIds.has(nodeId)}
              onToggleFavorite={() => toggleFavorite(nodeId)}
              itemId={itemId}
              vmid={vmid ?? 0}
              name={name}
              onAction={openConfirm}
              onManagePermissions={() =>
                openPermissions({
                  itemId: nodeId,
                  itemKind: "vm",
                  itemName: name ?? "",
                  itemVmid: vmid,
                })
              }
              onClone={() => {
                if (!pveNode || vmid === undefined) return

                openClone({
                  itemId,
                  currentName: name ?? "",
                  currentVmid: vmid,
                  isTemplate,
                })
              }}
              onRename={() => {
                if (pveNode && vmid !== undefined) {
                  openRenameVm({
                    itemId,
                    currentName: name ?? "",
                    currentVmid: vmid,
                  })
                }
              }}
              isLoading={isLoading}
            />
          ) : (
            <VmMenuItems
              permissions={permissions}
              isFavorite={favoriteIds.has(nodeId)}
              onToggleFavorite={() => toggleFavorite(nodeId)}
              itemId={itemId}
              vmid={vmid ?? 0}
              name={name}
              onAction={openConfirm}
              onManagePermissions={() =>
                openPermissions({
                  itemId: nodeId,
                  itemKind: "vm",
                  itemName: name ?? "",
                  itemVmid: vmid,
                })
              }
              onSnapshot={(mode) => {
                if (vmid === undefined) return

                openSnapshot({
                  itemId,
                  currentName: name,
                  currentVmid: vmid,
                  guestType,
                  mode,
                })
              }}
              onClone={() => {
                if (!pveNode || vmid === undefined) return

                openClone({
                  itemId,
                  currentName: name ?? "",
                  currentVmid: vmid,
                  isTemplate,
                })
              }}
              onRename={() => {
                if (pveNode && vmid !== undefined) {
                  openRenameVm({
                    itemId,
                    currentName: name ?? "",
                    currentVmid: vmid,
                  })
                }
              }}
              onEditHardware={() => {
                if (pveNode && vmid !== undefined) {
                  openEditVmHardware({
                    itemId,
                    currentName: name ?? "",
                    currentVmid: vmid,
                  })
                }
              }}
              isLoading={isLoading}
              powerStatus={powerStatus}
              guestType={guestType}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
