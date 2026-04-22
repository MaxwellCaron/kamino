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
import { InventoryDeletionDescription } from "./inventory-deletion-description"
import { useInventoryDialogs } from "./inventory-dialogs-provider"
import { useInventoryFavorites } from "./tree/inventory-tree"
import type { ConfirmConfig } from "./inventory-confirm-actions"
import type {
  ApiBulkVmMutationResponse,
  ApiTreeNode,
  ApiTreeNodePermissions,
} from "@/lib/queries"
import { findTreeNode, inventoryTreeQueryOptions } from "@/lib/queries"
import {
  InventoryPermissionBits,
  canRequestInventoryPermission,
  hasInventoryPermission,
} from "@/lib/inventory-permissions"
import { summarizeFolderDeletion } from "@/lib/inventory-tree"
import { formatVmReference } from "@/lib/utils"
import { useDeleteFolder } from "@/hooks/use-inventory-actions"
import {
  useConvertToTemplate,
  useDeleteVM,
  useSubmitInventoryDeleteRequest,
  useSubmitInventoryPowerRequest,
  useVmPowerAction,
} from "@/hooks/use-vm-actions"

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

const FOLDER_ACTION_PERMISSIONS = [
  InventoryPermissionBits.createFolder,
  InventoryPermissionBits.createVm,
  InventoryPermissionBits.renameFolder,
  InventoryPermissionBits.deleteFolder,
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

function getPermissionMode(
  permissions: ApiTreeNodePermissions,
  requiredPermission: number
): "direct" | "request" | null {
  if (hasInventoryPermission(permissions, requiredPermission)) {
    return "direct"
  }

  if (canRequestInventoryPermission(permissions, requiredPermission)) {
    return "request"
  }

  return null
}

function hasNodeActions(data: ApiTreeNode) {
  return data.kind === "folder"
    ? hasAnyPermission(data.permissions, FOLDER_ACTION_PERMISSIONS)
    : true
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
  const submitDeleteRequest = useSubmitInventoryDeleteRequest()
  const toTemplate = useConvertToTemplate()
  const vmIdentifier = formatVmReference(vmid, name)
  const powerMode = getPermissionMode(
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
  const snapshotMode = getPermissionMode(
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
  const deleteMode = getPermissionMode(
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
  const hasTrailingItems = hasActionItems || hasEditItems || deleteMode !== null

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
                  title: powerMode === "direct" ? "Start" : "Request Start",
                  icon: IconPlayerPlay,
                  description:
                    powerMode === "direct"
                      ? `This will power on ${vmIdentifier}.`
                      : `Submit a request to power on ${vmIdentifier}. A reviewer must approve it before execution.`,
                  actionLabel:
                    powerMode === "direct" ? "Start" : "Submit Request",
                  variant: "default",
                  onConfirm: () => {
                    const promise: Promise<unknown> =
                      powerMode === "direct"
                        ? powerAction
                            .mutateAsync({ itemIds: [itemId], action: "start" })
                            .then((result) =>
                              assertSingleItemMutationSucceeded(
                                result,
                                `Failed to start VM ${vmIdentifier}`
                              )
                            )
                        : submitPowerRequest.mutateAsync({
                            itemId,
                            action: "start",
                          })

                    toast.promise(promise, {
                      loading:
                        powerMode === "direct"
                          ? `Starting VM ${vmIdentifier}…`
                          : `Submitting start request for ${vmIdentifier}…`,
                      success:
                        powerMode === "direct"
                          ? `VM ${vmIdentifier} started`
                          : `Start request for ${vmIdentifier} submitted`,
                      error: (err: Error) => err.message,
                    })
                  },
                })
              }
            >
              <IconPlayerPlay className="text-muted-foreground" />
              {powerMode === "direct" ? "Start" : "Request Start"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title:
                    powerMode === "direct" ? "Shutdown" : "Request Shutdown",
                  icon: IconPower,
                  description:
                    powerMode === "direct"
                      ? `This will send a shutdown signal to ${vmIdentifier}.`
                      : `Submit a request to shut down ${vmIdentifier}. A reviewer must approve it before execution.`,
                  actionLabel:
                    powerMode === "direct" ? "Shutdown" : "Submit Request",
                  variant: "destructive",
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
                                `Failed to shut down VM ${vmIdentifier}`
                              )
                            )
                        : submitPowerRequest.mutateAsync({
                            itemId,
                            action: "shutdown",
                          })

                    toast.promise(promise, {
                      loading:
                        powerMode === "direct"
                          ? `Shutting down VM ${vmIdentifier}…`
                          : `Submitting shutdown request for ${vmIdentifier}…`,
                      success:
                        powerMode === "direct"
                          ? `VM ${vmIdentifier} shut down`
                          : `Shutdown request for ${vmIdentifier} submitted`,
                      error: (err: Error) => err.message,
                    })
                  },
                })
              }
            >
              <IconPower className="text-muted-foreground" />
              {powerMode === "direct" ? "Shutdown" : "Request Shutdown"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title: powerMode === "direct" ? "Reboot" : "Request Reboot",
                  icon: IconRefresh,
                  description:
                    powerMode === "direct"
                      ? `This will send a reboot signal to ${vmIdentifier}.`
                      : `Submit a request to reboot ${vmIdentifier}. A reviewer must approve it before execution.`,
                  actionLabel:
                    powerMode === "direct" ? "Reboot" : "Submit Request",
                  variant: "destructive",
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
                                `Failed to reboot VM ${vmIdentifier}`
                              )
                            )
                        : submitPowerRequest.mutateAsync({
                            itemId,
                            action: "reboot",
                          })

                    toast.promise(promise, {
                      loading:
                        powerMode === "direct"
                          ? `Rebooting VM ${vmIdentifier}…`
                          : `Submitting reboot request for ${vmIdentifier}…`,
                      success:
                        powerMode === "direct"
                          ? `VM ${vmIdentifier} rebooted`
                          : `Reboot request for ${vmIdentifier} submitted`,
                      error: (err: Error) => err.message,
                    })
                  },
                })
              }
            >
              <IconRefresh className="text-muted-foreground" />
              {powerMode === "direct" ? "Reboot" : "Request Reboot"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title: powerMode === "direct" ? "Stop" : "Request Stop",
                  icon: IconPlayerStop,
                  description:
                    powerMode === "direct"
                      ? `This will immediately stop ${vmIdentifier}.`
                      : `Submit a request to stop ${vmIdentifier}. A reviewer must approve it before execution.`,
                  actionLabel:
                    powerMode === "direct" ? "Stop" : "Submit Request",
                  variant: "destructive",
                  onConfirm: () => {
                    const promise: Promise<unknown> =
                      powerMode === "direct"
                        ? powerAction
                            .mutateAsync({ itemIds: [itemId], action: "stop" })
                            .then((result) =>
                              assertSingleItemMutationSucceeded(
                                result,
                                `Failed to stop VM ${vmIdentifier}`
                              )
                            )
                        : submitPowerRequest.mutateAsync({
                            itemId,
                            action: "stop",
                          })

                    toast.promise(promise, {
                      loading:
                        powerMode === "direct"
                          ? `Stopping VM ${vmIdentifier}…`
                          : `Submitting stop request for ${vmIdentifier}…`,
                      success:
                        powerMode === "direct"
                          ? `VM ${vmIdentifier} stopped`
                          : `Stop request for ${vmIdentifier} submitted`,
                      error: (err: Error) => err.message,
                    })
                  },
                })
              }
            >
              <IconPlayerStop className="text-muted-foreground" />
              {powerMode === "direct" ? "Stop" : "Request Stop"}
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
                {snapshotMode === "direct"
                  ? "Snapshot"
                  : "Create Snapshot Request"}
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
                      toast.promise(
                        toTemplate
                          .mutateAsync({ itemIds: [itemId] })
                          .then((result) =>
                            assertSingleItemMutationSucceeded(
                              result,
                              `Failed to templatize VM ${vmIdentifier}`
                            )
                          ),
                        {
                          loading: `Templatizing VM ${vmIdentifier}…`,
                          success: `VM ${vmIdentifier} templatized`,
                          error: (err: Error) => err.message,
                        }
                      )
                    },
                  })
                }
              >
                <IconTemplate className="text-muted-foreground" />
                Templatize
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {(hasEditItems || deleteMode !== null) && <DropdownMenuSeparator />}
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
          {deleteMode !== null && <DropdownMenuSeparator />}
        </>
      )}
      {deleteMode !== null && (
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoading}
          onClick={() =>
            onAction({
              title: deleteMode === "direct" ? "Delete" : "Request Delete",
              icon: IconTrash,
              description:
                deleteMode === "direct"
                  ? `This will permanently delete ${vmIdentifier}.`
                  : `Submit a request to delete ${vmIdentifier}. A reviewer must approve it before execution.`,
              actionLabel:
                deleteMode === "direct" ? "Delete" : "Submit Request",
              variant: "destructive",
              onConfirm: () => {
                const promise: Promise<unknown> =
                  deleteMode === "direct"
                    ? deleteVm
                        .mutateAsync({ itemIds: [itemId] })
                        .then((result) =>
                          assertSingleItemMutationSucceeded(
                            result,
                            `Failed to delete VM ${vmIdentifier}`
                          )
                        )
                    : submitDeleteRequest.mutateAsync({ itemId })

                toast.promise(promise, {
                  loading:
                    deleteMode === "direct"
                      ? `Deleting VM ${vmIdentifier}…`
                      : `Submitting delete request for ${vmIdentifier}…`,
                  success:
                    deleteMode === "direct"
                      ? `VM ${vmIdentifier} deleted`
                      : `Delete request for ${vmIdentifier} submitted`,
                  error: (err: Error) => err.message,
                })
              },
            })
          }
        >
          <IconTrash />
          {deleteMode === "direct" ? "Delete" : "Delete Request"}
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
  const submitDeleteRequest = useSubmitInventoryDeleteRequest()
  const vmIdentifier = formatVmReference(vmid, name)
  const canClone = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.cloneVm
  )
  const deleteMode = getPermissionMode(
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
          {(hasEditItems || deleteMode !== null) && <DropdownMenuSeparator />}
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
          {deleteMode !== null && <DropdownMenuSeparator />}
        </>
      )}
      {deleteMode !== null && (
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoading}
          onClick={() =>
            onAction({
              title:
                deleteMode === "direct"
                  ? "Delete Template?"
                  : "Request Template Deletion",
              icon: IconTrash,
              description:
                deleteMode === "direct"
                  ? `This will permanently delete template ${vmIdentifier}.`
                  : `Submit a request to delete template ${vmIdentifier}. A reviewer must approve it before execution.`,
              actionLabel:
                deleteMode === "direct" ? "Delete" : "Submit Request",
              variant: "destructive",
              onConfirm: () => {
                const promise: Promise<unknown> =
                  deleteMode === "direct"
                    ? deleteVm
                        .mutateAsync({ itemIds: [itemId] })
                        .then((result) =>
                          assertSingleItemMutationSucceeded(
                            result,
                            `Failed to delete template ${vmIdentifier}`
                          )
                        )
                    : submitDeleteRequest.mutateAsync({ itemId })

                toast.promise(promise, {
                  loading:
                    deleteMode === "direct"
                      ? `Deleting template ${vmIdentifier}…`
                      : `Submitting delete request for template ${vmIdentifier}…`,
                  success:
                    deleteMode === "direct"
                      ? `Template ${vmIdentifier} deleted`
                      : `Delete request for template ${vmIdentifier} submitted`,
                  error: (err: Error) => err.message,
                })
              },
            })
          }
        >
          <IconTrash />
          {deleteMode === "direct" ? "Delete" : "Delete Request"}
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
  const hasActions = isFolder
    ? hasAnyPermission(permissions, FOLDER_ACTION_PERMISSIONS)
    : true

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
