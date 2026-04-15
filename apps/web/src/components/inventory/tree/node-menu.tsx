import { IconDots } from "@tabler/icons-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useSidebar } from "@workspace/ui/components/sidebar"
import { FolderDeletionDescription, MenuItems } from "../inventory-actions"
import { useInventoryDialogs } from "../inventory-dialogs-provider"
import type { ApiTreeNode } from "@/lib/queries"
import { useDeleteFolder } from "@/hooks/use-inventory-actions"
import { summarizeFolderDeletion } from "@/lib/inventory-tree"
import {
  InventoryPermissionBits,
  findTreeNode,
  hasInventoryPermission,
  inventoryTreeQueryOptions,
} from "@/lib/queries"

const FOLDER_ACTION_PERMISSIONS = [
  InventoryPermissionBits.createFolder,
  InventoryPermissionBits.createVm,
  InventoryPermissionBits.renameFolder,
  InventoryPermissionBits.deleteFolder,
  InventoryPermissionBits.managePermissions,
]

const VM_ACTION_PERMISSIONS = [
  InventoryPermissionBits.powerVm,
  InventoryPermissionBits.cloneVm,
  InventoryPermissionBits.snapshotVm,
  InventoryPermissionBits.renameVm,
  InventoryPermissionBits.deleteVm,
  InventoryPermissionBits.templateVm,
  InventoryPermissionBits.managePermissions,
]

function hasAnyPermission(data: ApiTreeNode, permissions: Array<number>) {
  return permissions.some((permission) =>
    hasInventoryPermission(data.permissions, permission)
  )
}

function hasNodeActions(data: ApiTreeNode) {
  return data.kind === "folder"
    ? hasAnyPermission(data, FOLDER_ACTION_PERMISSIONS)
    : hasAnyPermission(data, VM_ACTION_PERMISSIONS)
}

export function InventoryTreeNodeMenu({
  itemId,
  data,
}: {
  itemId: string
  data: ApiTreeNode
}) {
  const { isMobile } = useSidebar()
  const queryClient = useQueryClient()
  const deleteFolderMutation = useDeleteFolder()
  const {
    openConfirm,
    openCreateFolder,
    openRenameFolder,
    openCreateVm,
    openSnapshot,
    openClone,
    openRenameVm,
    openPermissions,
  } = useInventoryDialogs()

  const isFolder = data.kind === "folder"
  const isTemplate = data.vm?.is_template

  if (!hasNodeActions(data)) return null

  function handleDeleteFolder() {
    const tree =
      queryClient.getQueryData<Array<ApiTreeNode>>(
        inventoryTreeQueryOptions.queryKey
      ) ?? []

    const folder = findTreeNode(tree, itemId)

    if (!folder || folder.kind !== "folder") {
      toast.error("Failed to load folder details.")
      return
    }

    const summary = summarizeFolderDeletion(folder)

    openConfirm({
      title: `Delete folder "${data.name}"?`,
      description: (
        <FolderDeletionDescription
          folderName={data.name}
          folderCount={summary.folderCount}
          vmCount={summary.vmCount}
          templateCount={summary.templateCount}
          folderNames={summary.folderNames}
          vmNames={summary.vmNames}
          templateNames={summary.templateNames}
        />
      ),
      actionLabel: "Delete",
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteFolderMutation.mutateAsync({ id: itemId })
          toast.success(`Folder "${data.name}" deleted`)
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Failed to delete folder"
          )
          throw error
        }
      },
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto opacity-0 transition-opacity group-hover/row:opacity-100 data-popup-open:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <IconDots />
          </Button>
        }
      />
      <DropdownMenuContent align={isMobile ? "end" : "start"}>
        <MenuItems
          permissions={data.permissions}
          isFolder={isFolder}
          isTemplate={isTemplate}
          node={data.vm?.node ?? ""}
          vmid={data.vm?.vmid ?? 0}
          name={data.name}
          onAction={openConfirm}
          onManagePermissions={() =>
            openPermissions({
              itemId,
              itemKind: isFolder ? "folder" : "vm",
              itemName: data.name,
            })
          }
          onSnapshot={() => {
            if (!data.vm?.node) return
            openSnapshot({ node: data.vm.node, vmid: data.vm.vmid })
          }}
          onClone={() => {
            if (!data.vm?.node) return
            openClone({
              node: data.vm.node,
              vmid: data.vm.vmid,
              currentName: data.name,
              sourceItemId: itemId,
            })
          }}
          onRename={() => {
            if (isFolder) {
              openRenameFolder({ folderId: itemId, currentName: data.name })
              return
            }

            if (!isTemplate && data.vm?.node) {
              openRenameVm({
                node: data.vm.node,
                vmid: data.vm.vmid,
                currentName: data.name,
              })
            }
          }}
          onCreateVm={() => openCreateVm({ initialFolderId: itemId })}
          onCreateFolder={() => openCreateFolder({ parentId: itemId })}
          onDeleteFolder={handleDeleteFolder}
          isLoading={false}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
