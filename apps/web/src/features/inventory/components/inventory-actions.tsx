import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  IconCamera,
  IconCopy,
  IconDeviceDesktopPlus,
  IconDots,
  IconEdit,
  IconExternalLink,
  IconFolderPlus,
  IconGauge,
  IconLock,
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
import { useInventoryFavorites } from "../hooks/use-inventory-favorites"
import { inventoryTreeQueryOptions } from "../api/inventory-api"
import {
  getFolderCapabilities,
  getVmCapabilities,
  hasFolderActions,
  hasNodeActions,
} from "../utils/inventory-capabilities"
import {
  findInventoryTreeNode,
  summarizeFolderDeletion,
} from "../utils/inventory-tree"
import { useDeleteFolder } from "../hooks/use-inventory-actions"
import { InventoryDeletionDescription } from "./inventory-deletion-description"
import { useInventoryDialogs } from "./inventory-dialogs-provider"
import type {
  ApiTreeNode,
  ApiTreeNodePermissions,
} from "../types/inventory-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { ApiBulkVmMutationResponse } from "@/features/vms/types/vm-types"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"
import {
  formatMutationError,
  formatToastError,
  formatVmReference,
} from "@/features/shared/utils/format"
import {
  useConvertToTemplate,
  useDeleteVM,
} from "@/features/vms/hooks/use-vm-actions"
import { useVmPowerActions } from "@/features/vms/hooks/use-vm-power-actions"
import {
  toastDeleteVm,
  toastTemplatizeVm,
} from "@/features/vms/utils/vm-toasts"

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

function GeneralVmMenuItems({
  itemId,
  isFavorite,
  onToggleFavorite,
  isLoading,
}: {
  itemId: string
  isFavorite?: boolean
  onToggleFavorite?: () => void
  isLoading?: boolean
}) {
  const canToggleFavorite = hasFavoriteAction(onToggleFavorite)

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>General</DropdownMenuLabel>
      <DropdownMenuItem
        render={
          <Link
            to="/inventory/items/$itemId"
            params={{ itemId }}
            target="_blank"
            rel="noreferrer"
          />
        }
      >
        <IconExternalLink className="text-muted-foreground" />
        Open
      </DropdownMenuItem>
      {canToggleFavorite && (
        <DropdownMenuItem onClick={onToggleFavorite} disabled={isLoading}>
          <IconStar className="text-muted-foreground" />
          {isFavorite ? "Unfavorite" : "Favorite"}
        </DropdownMenuItem>
      )}
    </DropdownMenuGroup>
  )
}

function FolderMenuItems({
  permissions,
  onCreateVm,
  onCreateFolder,
  onManagePermissions,
  onEditLimit,
  onRename,
  onDelete,
  isLoading,
}: {
  permissions: ApiTreeNodePermissions
  onCreateVm: () => void
  onCreateFolder: () => void
  onManagePermissions: () => void
  onEditLimit: () => void
  onRename: () => void
  onDelete: () => void
  isLoading?: boolean
}) {
  const capabilities = getFolderCapabilities(permissions)

  return (
    <>
      {capabilities.hasCreateActions && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Create</DropdownMenuLabel>
            {capabilities.createFolder.visible && (
              <DropdownMenuItem onClick={onCreateFolder} disabled={isLoading}>
                <IconFolderPlus className="text-muted-foreground" />
                New Folder
              </DropdownMenuItem>
            )}
            {capabilities.createVm.visible && (
              <DropdownMenuItem onClick={onCreateVm} disabled={isLoading}>
                <IconDeviceDesktopPlus className="text-muted-foreground" />
                New VM
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {(capabilities.hasEditActions || capabilities.delete.visible) && (
            <DropdownMenuSeparator />
          )}
        </>
      )}
      {capabilities.hasEditActions && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Edit</DropdownMenuLabel>
            {capabilities.rename.visible && (
              <DropdownMenuItem onClick={onRename} disabled={isLoading}>
                <IconEdit className="text-muted-foreground" />
                Rename
              </DropdownMenuItem>
            )}
            {capabilities.managePermissions.visible && (
              <DropdownMenuItem onClick={onEditLimit} disabled={isLoading}>
                <IconGauge className="text-muted-foreground" />
                Limit
              </DropdownMenuItem>
            )}
            {capabilities.managePermissions.visible && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <IconLock className="text-muted-foreground" />
                Permissions
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {capabilities.delete.visible && <DropdownMenuSeparator />}
        </>
      )}
      {capabilities.delete.visible && (
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
  powerStatus,
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
  powerStatus?: string
}) {
  const deleteVm = useDeleteVM()
  const toTemplate = useConvertToTemplate()
  const powerActions = useVmPowerActions({
    itemId,
    permissions,
    powerStatus,
    vmid,
    vmName: name,
    isLoading,
  })
  const capabilities = getVmCapabilities(permissions)
  const hasActionItems = capabilities.hasActionItems
  const hasItemsAfterGeneral =
    powerActions.powerMode !== null ||
    hasActionItems ||
    capabilities.hasEditItems ||
    capabilities.delete.visible

  return (
    <>
      <GeneralVmMenuItems
        itemId={itemId}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        isLoading={isLoading}
      />
      {hasItemsAfterGeneral && <DropdownMenuSeparator />}
      {powerActions.powerMode !== null && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Power</DropdownMenuLabel>
            {powerActions.actions.map((action) => {
              const ActionIcon = action.icon

              return (
                <DropdownMenuItem
                  key={action.action}
                  variant={
                    action.action === "stop" ? "destructive" : "default"
                  }
                  disabled={action.disabled}
                  onClick={() =>
                    powerActions.openPowerAction(action.action, onAction)
                  }
                >
                  <ActionIcon className="text-muted-foreground" />
                  {action.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
          {(hasActionItems ||
            capabilities.hasEditItems ||
            capabilities.delete.visible) && <DropdownMenuSeparator />}
        </>
      )}
      {hasActionItems && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {capabilities.clone.visible && (
              <DropdownMenuItem onClick={onClone} disabled={isLoading}>
                <IconCopy className="text-muted-foreground" />
                Clone
              </DropdownMenuItem>
            )}
            {capabilities.snapshot.visible && (
              <DropdownMenuItem
                onClick={() => {
                  if (capabilities.snapshot.mode) {
                    onSnapshot(capabilities.snapshot.mode)
                  }
                }}
                disabled={isLoading}
              >
                <IconCamera className="text-muted-foreground" />
                Snapshot
              </DropdownMenuItem>
            )}
            {capabilities.template.visible && (
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
          {(capabilities.hasEditItems || capabilities.delete.visible) && (
            <DropdownMenuSeparator />
          )}
        </>
      )}
      {capabilities.hasEditItems && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Edit</DropdownMenuLabel>
            {capabilities.rename.visible && (
              <DropdownMenuItem onClick={onRename} disabled={isLoading}>
                <IconEdit className="text-muted-foreground" />
                Rename
              </DropdownMenuItem>
            )}
            {capabilities.editHardware.visible && (
              <DropdownMenuItem onClick={onEditHardware} disabled={isLoading}>
                <IconSettings className="text-muted-foreground" />
                Hardware
              </DropdownMenuItem>
            )}
            {capabilities.managePermissions.visible && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <IconLock className="text-muted-foreground" />
                Permissions
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {capabilities.delete.visible && <DropdownMenuSeparator />}
        </>
      )}
      {capabilities.delete.visible && (
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
  const capabilities = getVmCapabilities(permissions, { isTemplate: true })
  const hasActionItems = capabilities.clone.visible

  return (
    <>
      <GeneralVmMenuItems
        itemId={itemId}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        isLoading={isLoading}
      />
      {(hasActionItems ||
        capabilities.hasEditItems ||
        capabilities.delete.visible) && <DropdownMenuSeparator />}
      {hasActionItems && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {capabilities.clone.visible && (
              <DropdownMenuItem onClick={onClone} disabled={isLoading}>
                <IconCopy className="text-muted-foreground" />
                Clone
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {(capabilities.hasEditItems || capabilities.delete.visible) && (
            <DropdownMenuSeparator />
          )}
        </>
      )}
      {capabilities.hasEditItems && (
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
          {capabilities.delete.visible && <DropdownMenuSeparator />}
        </>
      )}
      {capabilities.delete.visible && (
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
                  error: formatToastError,
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
  onEditLimit,
  onSnapshot,
  onClone,
  onRename,
  onEditHardware,
  onCreateVm,
  onCreateFolder,
  onDeleteFolder,
  isLoading,
  powerStatus,
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
  onEditLimit: () => void
  onSnapshot: (mode: "direct" | "request") => void
  onClone: () => void
  onRename: () => void
  onEditHardware: () => void
  onCreateVm: () => void
  onCreateFolder: () => void
  onDeleteFolder: () => void
  isLoading?: boolean
  powerStatus?: string
}) {
  if (isFolder)
    return (
      <FolderMenuItems
        permissions={permissions}
        onCreateFolder={onCreateFolder}
        onCreateVm={onCreateVm}
        onManagePermissions={onManagePermissions}
        onEditLimit={onEditLimit}
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
      powerStatus={powerStatus}
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
    openFolderLimit,
    openRenameFolder,
    openCreateVm,
    openSnapshot,
    openClone,
    openRenameVm,
    openEditVmHardware,
    openPermissions,
  } = useInventoryDialogs()
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)

  const isFolder = data.kind === "folder"
  const isTemplate = data.vm?.is_template
  const isFavorite = !isFolder && favoriteIds.has(itemId)
  const powerStatus =
    data.kind === "vm" && data.vm ? vmStatuses?.[data.vm.vmid] : undefined

  if (!hasNodeActions(data)) return null

  function handleDeleteFolder() {
    const tree =
      queryClient.getQueryData<Array<ApiTreeNode>>(
        inventoryTreeQueryOptions.queryKey
      ) ?? []

    const folder = findInventoryTreeNode(tree, itemId)

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
          onEditLimit={() =>
            openFolderLimit({
              directVmLimit: data.direct_vm_limit,
              effectiveVmLimit: data.effective_vm_limit,
              folderId: itemId,
              folderName: data.name,
              vmCount: data.vm_count,
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
              isTemplate: data.vm.is_template,
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
          powerStatus={powerStatus}
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
  powerStatus,
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
            onEditLimit={() => {}}
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
                isTemplate,
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
            powerStatus={powerStatus}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
