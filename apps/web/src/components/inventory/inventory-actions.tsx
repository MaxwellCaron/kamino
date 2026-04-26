import { useQueryClient } from "@tanstack/react-query"
import {
  IconCamera,
  IconCopy,
  IconDeviceDesktopPlus,
  IconDots,
  IconEdit,
  IconFolderPlus,
  IconLock,
  IconPlayerPlay,
  IconPlayerStop,
  IconPower,
  IconRefresh,
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
import { toast } from "sonner"
import { useSidebar } from "@workspace/ui/components/sidebar"
import { Button } from "@workspace/ui/components/button"
import { useInventoryDialogs } from "./inventory-dialogs-provider"
import { InventoryDeletionDescription } from "./inventory-deletion-description"
import { useInventoryFavorites } from "./tree/use-inventory-favorites"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type {
  ApiBulkVmMutationResponse,
  ApiTreeNode,
  ApiTreeNodePermissions,
} from "@/lib/queries"
import { findTreeNode, inventoryTreeQueryOptions } from "@/lib/queries"
import {
  InventoryPermissionBits,
  hasInventoryPermission,
} from "@/lib/inventory-permissions"
import { summarizeFolderDeletion } from "@/lib/inventory-tree"
import { formatVmReference } from "@/lib/utils"
import { useDeleteFolder } from "@/hooks/use-inventory-actions"
import {
  useConvertToTemplate,
  useDeleteVM,
  useSubmitInventoryPowerRequest,
  useVmPowerAction,
} from "@/hooks/use-vm-actions"
import {
  getVmPowerActionConfig,
  toastDeleteVm,
  toastTemplatizeVm,
  toastVmPowerAction,
} from "@/components/vm/utils"
import {
  getInventoryPermissionMode,
  hasFolderActions,
  hasNodeActions,
} from "@/components/inventory/permissions/utils"

function formatMutationError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function assertSingleItemMutationSucceeded(
  result: ApiBulkVmMutationResponse,
  fallback: string
) {
  if (result.failed.length > 0 || result.succeeded.length === 0) {
    throw new Error(result.failed[0]?.error ?? fallback)
  }

  return result
}

function stopTreeItemEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

function hasFavoriteAction(onToggleFavorite?: () => void) {
  return typeof onToggleFavorite === "function"
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
                <IconDeviceDesktopPlus className="text-muted-foreground" />
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
            <DropdownMenuLabel>Edit</DropdownMenuLabel>
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
  onSnapshot: (mode: "direct" | "request") => void
  onClone: () => void
  onRename: () => void
  onEditHardware: () => void
  isLoading?: boolean
}) {
  const powerAction = useVmPowerAction()
  const submitPowerRequest = useSubmitInventoryPowerRequest()
  const deleteVm = useDeleteVM()
  const toTemplate = useConvertToTemplate()

  const powerMode = getInventoryPermissionMode(
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
  const snapshotMode = getInventoryPermissionMode(
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
  const canToggleFavorite = hasFavoriteAction(onToggleFavorite)
  const hasActionItems =
    canToggleFavorite || canClone || snapshotMode !== null || canTemplate
  const hasEditItems = canRename || canEditHardware || canManagePermissions
  const hasTrailingItems = hasActionItems || hasEditItems || canDelete

  return (
    <>
      {powerMode !== null && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Power</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  ...getVmPowerActionConfig("start", powerMode, vmid, name),
                  onConfirm: () => {
                    const promise: Promise<unknown> =
                      powerMode === "direct"
                        ? powerAction
                            .mutateAsync({ itemIds: [itemId], action: "start" })
                            .then((result) =>
                              assertSingleItemMutationSucceeded(
                                result,
                                `Failed to start VM ${vmid}`
                              )
                            )
                        : submitPowerRequest.mutateAsync({
                            itemId,
                            action: "start",
                          })

                    toastVmPowerAction(promise, "start", powerMode, vmid, name)
                  },
                })
              }
            >
              <IconPlayerPlay className="text-muted-foreground" />
              {powerMode === "direct" ? "Start" : "Start"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  ...getVmPowerActionConfig("shutdown", powerMode, vmid, name),
                  onConfirm: () => {
                    const promise: Promise<unknown> =
                      powerMode === "direct"
                        ? powerAction
                            .mutateAsync({
                              itemIds: [itemId],
                              action: "shutdown",
                            })
                            .then((result) =>
                              assertSingleItemMutationSucceeded(
                                result,
                                `Failed to shut down VM ${vmid}`
                              )
                            )
                        : submitPowerRequest.mutateAsync({
                            itemId,
                            action: "shutdown",
                          })

                    toastVmPowerAction(
                      promise,
                      "shutdown",
                      powerMode,
                      vmid,
                      name
                    )
                  },
                })
              }
            >
              <IconPower className="text-muted-foreground" />
              {powerMode === "direct" ? "Shutdown" : "Shutdown"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  ...getVmPowerActionConfig("reboot", powerMode, vmid, name),
                  onConfirm: () => {
                    const promise: Promise<unknown> =
                      powerMode === "direct"
                        ? powerAction
                            .mutateAsync({
                              itemIds: [itemId],
                              action: "reboot",
                            })
                            .then((result) =>
                              assertSingleItemMutationSucceeded(
                                result,
                                `Failed to reboot VM ${vmid}`
                              )
                            )
                        : submitPowerRequest.mutateAsync({
                            itemId,
                            action: "reboot",
                          })

                    toastVmPowerAction(promise, "reboot", powerMode, vmid, name)
                  },
                })
              }
            >
              <IconRefresh className="text-muted-foreground" />
              {powerMode === "direct" ? "Reboot" : "Reboot"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  ...getVmPowerActionConfig("stop", powerMode, vmid, name),
                  onConfirm: () => {
                    const promise: Promise<unknown> =
                      powerMode === "direct"
                        ? powerAction
                            .mutateAsync({ itemIds: [itemId], action: "stop" })
                            .then((result) =>
                              assertSingleItemMutationSucceeded(
                                result,
                                `Failed to stop VM ${vmid}`
                              )
                            )
                        : submitPowerRequest.mutateAsync({
                            itemId,
                            action: "stop",
                          })

                    toastVmPowerAction(promise, "stop", powerMode, vmid, name)
                  },
                })
              }
            >
              <IconPlayerStop className="text-muted-foreground" />
              {powerMode === "direct" ? "Stop" : "Stop"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {hasTrailingItems && <DropdownMenuSeparator />}
        </>
      )}
      {hasActionItems && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {canToggleFavorite && (
              <DropdownMenuItem onClick={onToggleFavorite} disabled={isLoading}>
                <IconStar className="text-muted-foreground" />
                {isFavorite ? "Unfavorite" : "Favorite"}
              </DropdownMenuItem>
            )}
            {canClone && (
              <DropdownMenuItem onClick={onClone} disabled={isLoading}>
                <IconCopy className="text-muted-foreground" />
                Clone
              </DropdownMenuItem>
            )}
            {snapshotMode !== null && (
              <DropdownMenuItem
                onClick={() => onSnapshot(snapshotMode)}
                disabled={isLoading}
              >
                <IconCamera className="text-muted-foreground" />
                {snapshotMode === "direct" ? "Snapshot" : "Snapshot"}
              </DropdownMenuItem>
            )}
            {canTemplate && (
              <DropdownMenuItem
                disabled={isLoading}
                onClick={() =>
                  onAction({
                    title: "Templatize",
                    icon: IconTemplate,
                    description: `This will convert ${formatVmReference(vmid, name)} to a template. Once a VM is converted to a template, you will not be able to make any additional edits to this VM.`,
                    actionLabel: "Templatize",
                    variant: "destructive",
                    onConfirm: () => {
                      const promise = toTemplate
                        .mutateAsync({ itemIds: [itemId] })
                        .then((result) =>
                          assertSingleItemMutationSucceeded(
                            result,
                            `Failed to templatize VM ${vmid}`
                          )
                        )

                      toastTemplatizeVm(promise, vmid, name)
                    },
                  })
                }
              >
                <IconTemplate className="text-muted-foreground" />
                Templatize
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {(hasEditItems || canDelete) && <DropdownMenuSeparator />}
        </>
      )}
      {hasEditItems && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Edit</DropdownMenuLabel>
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
              description: `This will permanently delete ${formatVmReference(vmid, name)}.`,
              actionLabel: "Delete",
              variant: "destructive",
              onConfirm: () => {
                const promise = deleteVm
                  .mutateAsync({ itemIds: [itemId] })
                  .then((result) =>
                    assertSingleItemMutationSucceeded(
                      result,
                      `Failed to delete VM ${vmid}`
                    )
                  )

                toastDeleteVm(promise, vmid, name)
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
  const canToggleFavorite = hasFavoriteAction(onToggleFavorite)
  const hasActionItems = canToggleFavorite || canClone
  const hasEditItems = canManagePermissions

  return (
    <>
      {hasActionItems && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {canToggleFavorite && (
              <DropdownMenuItem onClick={onToggleFavorite} disabled={isLoading}>
                <IconStar className="text-muted-foreground" />
                {isFavorite ? "Unfavorite" : "Favorite"}
              </DropdownMenuItem>
            )}
            {canClone && (
              <DropdownMenuItem onClick={onClone} disabled={isLoading}>
                <IconCopy className="text-muted-foreground" />
                Clone
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {(hasEditItems || canDelete) && <DropdownMenuSeparator />}
        </>
      )}
      {hasEditItems && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Edit</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={onManagePermissions}
              disabled={isLoading}
            >
              <IconLock className="text-muted-foreground" />
              Permissions
            </DropdownMenuItem>
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
              description: `This will permanently delete template ${vmIdentifier}.`,
              actionLabel: "Delete",
              variant: "destructive",
              onConfirm: () => {
                const promise = deleteVm
                  .mutateAsync({ itemIds: [itemId] })
                  .then((result) =>
                    assertSingleItemMutationSucceeded(
                      result,
                      `Failed to delete template ${vmIdentifier}`
                    )
                  )

                toast.promise(promise, {
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
  onSnapshot: (mode: "direct" | "request") => void
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
        <InventoryDeletionDescription
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
          onSnapshot={(mode) => {
            if (data.vm?.vmid == null) return

            openSnapshot({
              itemId,
              currentName: data.name,
              currentVmid: data.vm.vmid,
              mode,
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
  const hasActions = isFolder ? hasFolderActions(permissions) : true

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
            onSnapshot={(mode) => {
              if (vmid === undefined) return

              openSnapshot({
                itemId,
                currentName: name,
                currentVmid: vmid,
                mode,
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
