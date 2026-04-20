import { useQueryClient } from "@tanstack/react-query"
import {
  IconCamera,
  IconCopy,
  IconDots,
  IconEdit,
  IconFolder,
  IconFolderPlus,
  IconLock,
  IconPlayerPlay,
  IconPlayerStop,
  IconPower,
  IconRefresh,
  IconServer,
  IconServerSpark,
  IconSettings,
  IconStar,
  IconTemplate,
  IconTrash,
} from "@tabler/icons-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { toast } from "sonner"
import { useSidebar } from "@workspace/ui/components/sidebar"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { useInventoryDialogs } from "./inventory-dialogs-provider"
import { useInventoryFavorites } from "./tree/inventory-tree"
import type { ConfirmConfig } from "./inventory-confirm-actions"
import type { ApiTreeNode, ApiTreeNodePermissions } from "@/lib/queries"
import {
  InventoryPermissionBits,
  findTreeNode,
  hasInventoryPermission,
  inventoryTreeQueryOptions,
} from "@/lib/queries"
import { summarizeFolderDeletion } from "@/lib/inventory-tree"
import { formatVmReference } from "@/lib/utils"
import { useDeleteFolder } from "@/hooks/use-inventory-actions"
import {
  useConvertToTemplate,
  useDeleteVM,
  useVmPowerAction,
} from "@/hooks/use-vm-actions"

function formatMutationError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function formatAffectedItems(
  items: Array<string>,
  totalCount: number,
  emptyLabel: string
): string {
  if (totalCount === 0) return emptyLabel
  if (items.length === 0) return pluralize(totalCount, "item")

  const remainingCount = Math.max(totalCount - items.length, 0)
  const listedItems = items.join(", ")

  return remainingCount > 0
    ? `${listedItems}, and ${pluralize(remainingCount, "other item")}`
    : listedItems
}

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
  InventoryPermissionBits.editVmHardware,
  InventoryPermissionBits.deleteVm,
  InventoryPermissionBits.templateVm,
  InventoryPermissionBits.managePermissions,
]

function hasAnyPermission(
  permissions: ApiTreeNodePermissions,
  requiredPermissions: Array<number>
) {
  return requiredPermissions.some((permission) =>
    hasInventoryPermission(permissions, permission)
  )
}

function hasNodeActions(data: ApiTreeNode) {
  return data.kind === "folder"
    ? hasAnyPermission(data.permissions, FOLDER_ACTION_PERMISSIONS)
    : hasAnyPermission(data.permissions, VM_ACTION_PERMISSIONS)
}

function stopTreeItemEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

export function FolderDeletionDescription({
  folderCount,
  vmCount,
  templateCount,
  folderNames,
  vmNames,
  templateNames,
}: {
  folderName: string
  folderCount: number
  vmCount: number
  templateCount: number
  folderNames: Array<string>
  vmNames: Array<string>
  templateNames: Array<string>
}) {
  return (
    <>
      <p>The following items will be permanently deleted.</p>
      <div className="space-y-4 pt-4">
        <Item variant="muted">
          <ItemMedia variant="icon">
            <IconFolder />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-foreground">
              <span>Folders</span>
              <Badge variant={folderCount !== 0 ? "destructive" : "outline"}>
                {folderCount}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {formatAffectedItems(folderNames, folderCount, "—")}
            </ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="muted">
          <ItemMedia variant="icon">
            <IconServer />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-foreground">
              <span>VMs</span>
              <Badge variant={vmCount !== 0 ? "destructive" : "outline"}>
                {vmCount}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {formatAffectedItems(vmNames, vmCount, "—")}
            </ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="muted">
          <ItemMedia variant="icon">
            <IconTemplate />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-foreground">
              <span>Templates</span>
              <Badge variant={templateCount !== 0 ? "destructive" : "outline"}>
                {templateCount}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {formatAffectedItems(templateNames, templateCount, "—")}
            </ItemDescription>
          </ItemContent>
        </Item>
      </div>
    </>
  )
}

function FolderMenuItems({
  permissions,
  onCreateVm,
  onCreateFolder,
  onManagePermissions,
  onRename,
  onDelete,
  isLoading,
}: {
  permissions: ApiTreeNodePermissions
  onCreateVm: () => void
  onCreateFolder: () => void
  onManagePermissions: () => void
  onRename: () => void
  onDelete: () => void
  isLoading?: boolean
}) {
  const canCreateFolder = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.createFolder
  )
  const canCreateVm = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.createVm
  )
  const canRename = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.renameFolder
  )
  const canDelete = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.deleteFolder
  )
  const canManagePermissions = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.managePermissions
  )

  return (
    <>
      {(canCreateFolder || canCreateVm) && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Create</DropdownMenuLabel>
            {canCreateFolder && (
              <DropdownMenuItem onClick={onCreateFolder} disabled={isLoading}>
                <IconFolderPlus className="text-muted-foreground" />
                New Folder
              </DropdownMenuItem>
            )}
            {canCreateVm && (
              <DropdownMenuItem onClick={onCreateVm} disabled={isLoading}>
                <IconServerSpark className="text-muted-foreground" />
                New VM
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {(canRename || canManagePermissions || canDelete) && (
            <DropdownMenuSeparator />
          )}
        </>
      )}
      {(canRename || canManagePermissions) && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {canRename && (
              <DropdownMenuItem onClick={onRename} disabled={isLoading}>
                <IconEdit className="text-muted-foreground" />
                Rename
              </DropdownMenuItem>
            )}
            {canManagePermissions && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <IconLock className="text-muted-foreground" />
                Permissions
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {canDelete && <DropdownMenuSeparator />}
        </>
      )}
      {canDelete && (
        <DropdownMenuItem
          variant="destructive"
          onClick={onDelete}
          disabled={isLoading}
        >
          <IconTrash />
          Delete
        </DropdownMenuItem>
      )}
    </>
  )
}

function VmMenuItems({
  permissions,
  isFavorite,
  onToggleFavorite,
  itemId,
  vmid,
  name,
  onAction,
  onManagePermissions,
  onSnapshot,
  onClone,
  onRename,
  onEditHardware,
  isLoading,
}: {
  permissions: ApiTreeNodePermissions
  isFavorite?: boolean
  onToggleFavorite?: () => void
  itemId: string
  vmid: number
  name?: string
  onAction: (config: ConfirmConfig) => void
  onManagePermissions: () => void
  onSnapshot: () => void
  onClone: () => void
  onRename: () => void
  onEditHardware: () => void
  isLoading?: boolean
}) {
  const powerAction = useVmPowerAction()
  const deleteVm = useDeleteVM()
  const toTemplate = useConvertToTemplate()
  const vmIdentifier = formatVmReference(vmid, name)
  const canPower = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.powerVm
  )
  const canClone = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.cloneVm
  )
  const canTemplate = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.templateVm
  )
  const canSnapshot = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.snapshotVm
  )
  const canRename = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.renameVm
  )
  const canEditHardware = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.editVmHardware
  )
  const canDelete = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.deleteVm
  )
  const canManagePermissions = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.managePermissions
  )

  return (
    <>
      {canPower && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Power</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title: "Start",
                  icon: IconPlayerPlay,
                  description: `This will power on ${vmIdentifier}.`,
                  actionLabel: "Start",
                  variant: "default",
                  onConfirm: () => {
                    toast.promise(
                      powerAction.mutateAsync({ itemId, action: "start" }),
                      {
                        loading: `Starting VM ${vmIdentifier}…`,
                        success: `VM ${vmIdentifier} started`,
                        error: (err: Error) => err.message,
                      }
                    )
                  },
                })
              }
            >
              <IconPlayerPlay className="text-muted-foreground" />
              Start
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title: "Shutdown",
                  icon: IconPower,
                  description: `This will send a shutdown signal to ${vmIdentifier}.`,
                  actionLabel: "Shutdown",
                  variant: "destructive",
                  onConfirm: () => {
                    toast.promise(
                      powerAction.mutateAsync({ itemId, action: "shutdown" }),
                      {
                        loading: `Shutting down VM ${vmIdentifier}…`,
                        success: `VM ${vmIdentifier} shut down`,
                        error: (err: Error) => err.message,
                      }
                    )
                  },
                })
              }
            >
              <IconPower className="text-muted-foreground" />
              Shutdown
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title: "Reboot",
                  icon: IconRefresh,
                  description: `This will send a reboot signal to ${vmIdentifier}.`,
                  actionLabel: "Reboot",
                  variant: "destructive",
                  onConfirm: () => {
                    toast.promise(
                      powerAction.mutateAsync({ itemId, action: "reboot" }),
                      {
                        loading: `Rebooting VM ${vmIdentifier}…`,
                        success: `VM ${vmIdentifier} rebooted`,
                        error: (err: Error) => err.message,
                      }
                    )
                  },
                })
              }
            >
              <IconRefresh className="text-muted-foreground" />
              Reboot
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title: "Stop",
                  icon: IconPlayerStop,
                  description: `This will immediately stop ${vmIdentifier}.`,
                  actionLabel: "Stop",
                  variant: "destructive",
                  onConfirm: () => {
                    toast.promise(
                      powerAction.mutateAsync({ itemId, action: "stop" }),
                      {
                        loading: `Stopping VM ${vmIdentifier}…`,
                        success: `VM ${vmIdentifier} stopped`,
                        error: (err: Error) => err.message,
                      }
                    )
                  },
                })
              }
            >
              <IconPlayerStop className="text-muted-foreground" />
              Stop
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {(canClone ||
            canTemplate ||
            canSnapshot ||
            canRename ||
            canEditHardware ||
            canManagePermissions ||
            canDelete) && <DropdownMenuSeparator />}
        </>
      )}
      {(canClone ||
        canTemplate ||
        canSnapshot ||
        canRename ||
        canEditHardware ||
        canManagePermissions) && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={onToggleFavorite} disabled={isLoading}>
              <IconStar className="text-muted-foreground" />
              {isFavorite ? "Unfavorite" : "Favorite"}
            </DropdownMenuItem>
            {canClone && (
              <DropdownMenuItem onClick={onClone} disabled={isLoading}>
                <IconCopy className="text-muted-foreground" />
                Clone
              </DropdownMenuItem>
            )}
            {canTemplate && (
              <DropdownMenuItem
                disabled={isLoading}
                onClick={() =>
                  onAction({
                    title: "Templatize",
                    icon: IconTemplate,
                    description: `This will convert ${vmIdentifier} to a template. Once a VM is converted to a template, you will not be able to make any additional edits to this VM.`,
                    actionLabel: "Templatize",
                    variant: "destructive",
                    onConfirm: () => {
                      toast.promise(toTemplate.mutateAsync({ itemId }), {
                        loading: `Templatizing VM ${vmIdentifier}…`,
                        success: `VM ${vmIdentifier} templatized`,
                        error: (err: Error) => err.message,
                      })
                    },
                  })
                }
              >
                <IconTemplate className="text-muted-foreground" />
                Templatize
              </DropdownMenuItem>
            )}
            {canSnapshot && (
              <DropdownMenuItem onClick={onSnapshot} disabled={isLoading}>
                <IconCamera className="text-muted-foreground" />
                Snapshot
              </DropdownMenuItem>
            )}
            {canRename && (
              <DropdownMenuItem onClick={onRename} disabled={isLoading}>
                <IconEdit className="text-muted-foreground" />
                Rename
              </DropdownMenuItem>
            )}
            {canEditHardware && (
              <DropdownMenuItem onClick={onEditHardware} disabled={isLoading}>
                <IconSettings className="text-muted-foreground" />
                Hardware
              </DropdownMenuItem>
            )}
            {canManagePermissions && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <IconLock className="text-muted-foreground" />
                Permissions
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {canDelete && <DropdownMenuSeparator />}
        </>
      )}
      {canDelete && (
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoading}
          onClick={() =>
            onAction({
              title: "Delete",
              icon: IconTrash,
              description: `This will permanently delete ${vmIdentifier}. This action cannot be undone.`,
              actionLabel: "Delete",
              variant: "destructive",
              onConfirm: () => {
                toast.promise(deleteVm.mutateAsync({ itemId }), {
                  loading: `Deleting VM ${vmIdentifier}…`,
                  success: `VM ${vmIdentifier} deleted`,
                  error: (err: Error) => err.message,
                })
              },
            })
          }
        >
          <IconTrash />
          Delete
        </DropdownMenuItem>
      )}
    </>
  )
}

function TemplateMenuItems({
  permissions,
  isFavorite,
  onToggleFavorite,
  itemId,
  vmid,
  name,
  onAction,
  onManagePermissions,
  onClone,
  isLoading,
}: {
  permissions: ApiTreeNodePermissions
  isFavorite?: boolean
  onToggleFavorite?: () => void
  itemId: string
  vmid: number
  name?: string
  onAction: (config: ConfirmConfig) => void
  onManagePermissions: () => void
  onClone: () => void
  isLoading?: boolean
}) {
  const deleteVm = useDeleteVM()
  const vmIdentifier = formatVmReference(vmid, name)
  const canClone = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.cloneVm
  )
  const canDelete = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.deleteVm
  )
  const canManagePermissions = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.managePermissions
  )

  return (
    <>
      {(canClone || canManagePermissions) && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={onToggleFavorite} disabled={isLoading}>
              <IconStar className="text-muted-foreground" />
              {isFavorite ? "Unfavorite" : "Favorite"}
            </DropdownMenuItem>
            {canClone && (
              <DropdownMenuItem onClick={onClone} disabled={isLoading}>
                <IconCopy className="text-muted-foreground" />
                Clone
              </DropdownMenuItem>
            )}
            {canManagePermissions && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <IconLock className="text-muted-foreground" />
                Permissions
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {canDelete && <DropdownMenuSeparator />}
        </>
      )}
      {canDelete && (
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoading}
          onClick={() =>
            onAction({
              title: "Delete Template?",
              icon: IconTrash,
              description: `This will permanently delete template ${vmIdentifier}. This action cannot be undone.`,
              actionLabel: "Delete",
              variant: "destructive",
              onConfirm: () => {
                toast.promise(deleteVm.mutateAsync({ itemId }), {
                  loading: `Deleting template ${vmIdentifier}…`,
                  success: `Template ${vmIdentifier} deleted`,
                  error: (err: Error) => err.message,
                })
              },
            })
          }
        >
          <IconTrash />
          Delete
        </DropdownMenuItem>
      )}
    </>
  )
}

export function MenuItems({
  permissions,
  isFavorite,
  onToggleFavorite,
  isFolder,
  isTemplate,
  itemId,
  vmid,
  name,
  onAction,
  onManagePermissions,
  onSnapshot,
  onClone,
  onRename,
  onEditHardware,
  onCreateVm,
  onCreateFolder,
  onDeleteFolder,
  isLoading,
}: {
  permissions: ApiTreeNodePermissions
  isFavorite?: boolean
  onToggleFavorite?: () => void
  isFolder: boolean
  isTemplate?: boolean
  itemId: string
  vmid: number
  name?: string
  onAction: (config: ConfirmConfig) => void
  onManagePermissions: () => void
  onSnapshot: () => void
  onClone: () => void
  onRename: () => void
  onEditHardware: () => void
  onCreateVm: () => void
  onCreateFolder: () => void
  onDeleteFolder: () => void
  isLoading?: boolean
}) {
  if (isFolder)
    return (
      <FolderMenuItems
        permissions={permissions}
        onCreateFolder={onCreateFolder}
        onCreateVm={onCreateVm}
        onManagePermissions={onManagePermissions}
        onRename={onRename}
        onDelete={onDeleteFolder}
        isLoading={isLoading}
      />
    )
  if (isTemplate)
    return (
      <TemplateMenuItems
        permissions={permissions}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        itemId={itemId}
        vmid={vmid}
        name={name}
        onAction={onAction}
        onManagePermissions={onManagePermissions}
        onClone={onClone}
        isLoading={isLoading}
      />
    )
  return (
    <VmMenuItems
      permissions={permissions}
      isFavorite={isFavorite}
      onToggleFavorite={onToggleFavorite}
      itemId={itemId}
      vmid={vmid}
      name={name}
      onAction={onAction}
      onManagePermissions={onManagePermissions}
      onSnapshot={onSnapshot}
      onClone={onClone}
      onRename={onRename}
      onEditHardware={onEditHardware}
      isLoading={isLoading}
    />
  )
}

export function InventoryNodeMenu({
  itemId,
  data,
  className,
}: {
  itemId: string
  data: ApiTreeNode
  className?: string
}) {
  const { isMobile } = useSidebar()
  const queryClient = useQueryClient()
  const { favoriteIds, toggleFavorite } = useInventoryFavorites()
  const deleteFolderMutation = useDeleteFolder()
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

  const isFolder = data.kind === "folder"
  const isTemplate = data.vm?.is_template
  const isFavorite = !isFolder && favoriteIds.has(itemId)

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
      icon: IconTrash,
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
          toast.error(formatMutationError(error, "Failed to delete folder"))
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
            className={className}
            onClick={stopTreeItemEvent}
            onPointerDown={stopTreeItemEvent}
          >
            <IconDots />
          </Button>
        }
      />
      <DropdownMenuContent
        align={isMobile ? "end" : "start"}
        onClick={stopTreeItemEvent}
        onPointerDown={stopTreeItemEvent}
        onKeyDown={stopTreeItemEvent}
      >
        <MenuItems
          permissions={data.permissions}
          isFavorite={isFavorite}
          onToggleFavorite={() =>
            toggleFavorite(itemId, { disabled: isFolder })
          }
          isFolder={isFolder}
          isTemplate={isTemplate}
          itemId={itemId}
          vmid={data.vm?.vmid ?? 0}
          name={data.name}
          onAction={openConfirm}
          onManagePermissions={() =>
            openPermissions({
              itemId,
              itemKind: isFolder ? "folder" : "vm",
              itemName: data.name,
              itemVmid: data.vm?.vmid,
            })
          }
          onSnapshot={() => {
            if (!data.vm?.node) return

            openSnapshot({
              itemId,
              currentName: data.name,
              currentVmid: data.vm.vmid,
            })
          }}
          onClone={() => {
            if (!data.vm?.node) return

            openClone({
              itemId,
              currentName: data.name,
              currentVmid: data.vm.vmid,
            })
          }}
          onRename={() => {
            if (isFolder) {
              openRenameFolder({ folderId: itemId, currentName: data.name })
              return
            }

            if (!isTemplate && data.vm?.node) {
              openRenameVm({
                itemId,
                currentName: data.name,
                currentVmid: data.vm.vmid,
              })
            }
          }}
          onEditHardware={() => {
            if (!isFolder && !isTemplate && data.vm?.node) {
              openEditVmHardware({
                itemId,
                currentName: data.name,
                currentVmid: data.vm.vmid,
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

export function VmOptionsMenu({
  nodeId,
  itemId,
  permissions,
  isFolder = false,
  isTemplate,
  vmid,
  pveNode,
  name,
  isLoading,
}: {
  nodeId: string
  itemId: string
  permissions: ApiTreeNodePermissions
  isFolder?: boolean
  isTemplate?: boolean
  vmid?: number
  pveNode?: string
  name?: string
  isLoading?: boolean
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
  const hasActions =
    (isFolder &&
      (hasInventoryPermission(
        permissions,
        InventoryPermissionBits.createFolder
      ) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.createVm) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.renameFolder
        ) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.deleteFolder
        ) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.managePermissions
        ))) ||
    (!isFolder &&
      (hasInventoryPermission(permissions, InventoryPermissionBits.powerVm) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.cloneVm) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.snapshotVm
        ) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.editVmHardware
        ) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.renameVm) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.deleteVm) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.templateVm
        ) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.managePermissions
        )))

  if (!hasActions) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon">
              <IconDots />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <MenuItems
            permissions={permissions}
            isFavorite={!isFolder && favoriteIds.has(nodeId)}
            onToggleFavorite={() =>
              toggleFavorite(nodeId, { disabled: isFolder })
            }
            isFolder={isFolder}
            isTemplate={isTemplate}
            itemId={itemId}
            vmid={vmid ?? 0}
            name={name}
            onAction={openConfirm}
            onManagePermissions={() =>
              openPermissions({
                itemId: nodeId,
                itemKind: isFolder ? "folder" : "vm",
                itemName: name ?? "",
                itemVmid: vmid,
              })
            }
            onSnapshot={() => {
              if (!pveNode || vmid === undefined) return

              openSnapshot({
                itemId,
                currentName: name,
                currentVmid: vmid,
              })
            }}
            onClone={() => {
              if (!pveNode || vmid === undefined) return

              openClone({
                itemId,
                currentName: name ?? "",
                currentVmid: vmid,
              })
            }}
            onRename={() => {
              if (isFolder) {
                openRenameFolder({
                  folderId: nodeId,
                  currentName: name ?? "",
                })
                return
              }

              if (!isTemplate && pveNode && vmid !== undefined) {
                openRenameVm({
                  itemId,
                  currentName: name ?? "",
                  currentVmid: vmid,
                })
              }
            }}
            onEditHardware={() => {
              if (!isFolder && !isTemplate && pveNode && vmid !== undefined) {
                openEditVmHardware({
                  itemId,
                  currentName: name ?? "",
                  currentVmid: vmid,
                })
              }
            }}
            onCreateVm={() => openCreateVm({ initialFolderId: nodeId })}
            onCreateFolder={() => openCreateFolder({ parentId: nodeId })}
            onDeleteFolder={() => {}}
            isLoading={isLoading}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
