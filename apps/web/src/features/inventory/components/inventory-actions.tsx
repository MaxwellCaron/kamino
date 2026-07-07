import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Camera01Icon,
  ComputerAddIcon,
  Copy02Icon,
  CopyIcon,
  Delete01Icon,
  ExternalLinkIcon,
  FolderAddIcon,
  GaugeIcon,
  LockedIcon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  Settings01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons"
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
import { useDeleteFolder } from "../hooks/use-inventory-actions"
import { inventoryTreeQueryOptions } from "../api/inventory-api"
import {
  getFolderCapabilities,
  getVmCapabilities,
  hasFolderActions,
  hasNodeActions,
} from "../utils/inventory-capabilities"
import { findInventoryTreeNode } from "../utils/inventory-tree"
import { InventoryDeleteConfirmItems } from "./inventory-delete-confirm-items"
import { useInventoryDialogs } from "./inventory-dialogs-provider"
import type {
  ApiTreeNode,
  ApiTreeNodePermissions,
} from "../types/inventory-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { ApiBulkVmMutationResponse } from "@/features/vms/types/vm-types"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"
import { formatVmReference } from "@/features/shared/utils/format"
import {
  useConvertToTemplate,
  useDeleteVM,
} from "@/features/vms/hooks/use-vm-actions"
import { useVmPowerActions } from "@/features/vms/hooks/use-vm-power-actions"
import {
  toastDeleteVm,
  toastTemplatizeVm,
} from "@/features/vms/utils/vm-toasts"
import { VmIcon } from "@/components/status/vm-icon"
import { createInventoryDeleteItems } from "@/features/inventory/utils/inventory-delete-items"
import {
  showSingleMutationToast,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"

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
        <HugeiconsIcon
          icon={ExternalLinkIcon}
          className="text-muted-foreground"
        />
        Open
      </DropdownMenuItem>
      {canToggleFavorite && (
        <DropdownMenuItem onClick={onToggleFavorite} disabled={isLoading}>
          <HugeiconsIcon icon={StarIcon} className="text-muted-foreground" />
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
                <HugeiconsIcon
                  icon={FolderAddIcon}
                  className="text-muted-foreground"
                />
                New Folder
              </DropdownMenuItem>
            )}
            {capabilities.createVm.visible && (
              <DropdownMenuItem onClick={onCreateVm} disabled={isLoading}>
                <HugeiconsIcon
                  icon={ComputerAddIcon}
                  className="text-muted-foreground"
                />
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
                <HugeiconsIcon
                  icon={PencilEdit01Icon}
                  className="text-muted-foreground"
                />
                Rename
              </DropdownMenuItem>
            )}
            {capabilities.managePermissions.visible && (
              <DropdownMenuItem onClick={onEditLimit} disabled={isLoading}>
                <HugeiconsIcon
                  icon={GaugeIcon}
                  className="text-muted-foreground"
                />
                Limit
              </DropdownMenuItem>
            )}
            {capabilities.managePermissions.visible && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <HugeiconsIcon
                  icon={LockedIcon}
                  className="text-muted-foreground"
                />
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
          <HugeiconsIcon icon={Delete01Icon} />
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
              return (
                <DropdownMenuItem
                  key={action.action}
                  variant={action.action === "stop" ? "destructive" : "default"}
                  disabled={action.disabled}
                  onClick={() =>
                    powerActions.openPowerAction(action.action, onAction)
                  }
                >
                  <HugeiconsIcon
                    icon={action.icon}
                    className="text-muted-foreground"
                  />
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
                <HugeiconsIcon
                  icon={CopyIcon}
                  className="text-muted-foreground"
                />
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
                <HugeiconsIcon
                  icon={Camera01Icon}
                  className="text-muted-foreground"
                />
                Snapshot
              </DropdownMenuItem>
            )}
            {capabilities.template.visible && (
              <DropdownMenuItem
                disabled={isLoading}
                onClick={() =>
                  onAction({
                    title: "Templatize",
                    icon: Copy02Icon,
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
                <HugeiconsIcon
                  icon={Copy02Icon}
                  className="text-muted-foreground"
                />
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
                <HugeiconsIcon
                  icon={PencilEdit01Icon}
                  className="text-muted-foreground"
                />
                Rename
              </DropdownMenuItem>
            )}
            {capabilities.editHardware.visible && (
              <DropdownMenuItem onClick={onEditHardware} disabled={isLoading}>
                <HugeiconsIcon
                  icon={Settings01Icon}
                  className="text-muted-foreground"
                />
                Hardware
              </DropdownMenuItem>
            )}
            {capabilities.managePermissions.visible && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <HugeiconsIcon
                  icon={LockedIcon}
                  className="text-muted-foreground"
                />
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
              icon: Delete01Icon,
              description: `This will permanently delete ${formatVmReference(vmid, name)}.`,
              body: (
                <InventoryDeleteConfirmItems
                  items={[
                    {
                      id: itemId,
                      name: formatVmReference(vmid, name),
                      icon: <VmIcon status={powerStatus} />,
                    },
                  ]}
                />
              ),
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
          <HugeiconsIcon icon={Delete01Icon} />
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
  onRename,
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
  onRename: () => void
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
                <HugeiconsIcon
                  icon={CopyIcon}
                  className="text-muted-foreground"
                />
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
            {capabilities.rename.visible && (
              <DropdownMenuItem onClick={onRename} disabled={isLoading}>
                <HugeiconsIcon
                  icon={PencilEdit01Icon}
                  className="text-muted-foreground"
                />
                Rename
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onManagePermissions}
              disabled={isLoading}
            >
              <HugeiconsIcon
                icon={LockedIcon}
                className="text-muted-foreground"
              />
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
              icon: Delete01Icon,
              description: `This will permanently delete template ${vmIdentifier}.`,
              body: (
                <InventoryDeleteConfirmItems
                  items={[
                    {
                      id: itemId,
                      name: vmIdentifier,
                      icon: <VmIcon status={undefined} isTemplate />,
                    },
                  ]}
                />
              ),
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

                showSingleMutationToast({
                  title: "Deleting",
                  name: vmIdentifier,
                  promise,
                  successDescription: "Deleted",
                })
              },
            })
          }
        >
          <HugeiconsIcon icon={Delete01Icon} />
          Delete
        </DropdownMenuItem>
      )}
    </>
  )
}

function InventoryNodeMenuBody({
  itemId,
  data,
}: {
  itemId: string
  data: ApiTreeNode
}) {
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

    const deleteItems = createInventoryDeleteItems({
      folderTargets: [folder as ApiTreeNode & { kind: "folder" }],
      vmTargets: [],
      getVmStatus: (id) => {
        const node = findInventoryTreeNode(tree, id)
        return node?.vm ? vmStatuses?.[node.vm.vmid] : undefined
      },
    })

    openConfirm({
      title: `Delete folder "${data.name}"?`,
      icon: Delete01Icon,
      description: null,
      body: <InventoryDeleteConfirmItems items={deleteItems} />,
      actionLabel: "Delete",
      variant: "destructive",
      onConfirm: () => {
        showUnitMutationToast({
          title: `Deleting folder "${data.name}"`,
          units: [
            {
              items: deleteItems.map(({ id, name, successDescription }) => ({
                id,
                name,
                successDescription,
              })),
              run: async () => {
                await deleteFolderMutation.mutateAsync({ id: itemId })
              },
            },
          ],
        })
      },
    })
  }

  return (
    <>
      {isFolder ? (
        <FolderMenuItems
          permissions={data.permissions}
          onCreateFolder={() => openCreateFolder({ parentId: itemId })}
          onCreateVm={() => openCreateVm({ initialFolderId: itemId })}
          onManagePermissions={() =>
            openPermissions({
              itemId,
              itemKind: "folder",
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
          onRename={() =>
            openRenameFolder({ folderId: itemId, currentName: data.name })
          }
          onDelete={handleDeleteFolder}
          isLoading={false}
        />
      ) : isTemplate ? (
        <TemplateMenuItems
          permissions={data.permissions}
          isFavorite={isFavorite}
          onToggleFavorite={() => toggleFavorite(itemId)}
          itemId={itemId}
          vmid={data.vm?.vmid ?? 0}
          name={data.name}
          onAction={openConfirm}
          onManagePermissions={() =>
            openPermissions({
              itemId,
              itemKind: "vm",
              itemName: data.name,
              itemVmid: data.vm?.vmid,
            })
          }
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
            if (data.vm?.node) {
              openRenameVm({
                itemId,
                currentName: data.name,
                currentVmid: data.vm.vmid,
              })
            }
          }}
          isLoading={false}
        />
      ) : (
        <VmMenuItems
          permissions={data.permissions}
          isFavorite={isFavorite}
          onToggleFavorite={() => toggleFavorite(itemId)}
          itemId={itemId}
          vmid={data.vm?.vmid ?? 0}
          name={data.name}
          onAction={openConfirm}
          onManagePermissions={() =>
            openPermissions({
              itemId,
              itemKind: "vm",
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
              isTemplate: data.vm.is_template,
            })
          }}
          onRename={() => {
            if (data.vm?.node) {
              openRenameVm({
                itemId,
                currentName: data.name,
                currentVmid: data.vm.vmid,
              })
            }
          }}
          onEditHardware={() => {
            if (data.vm?.node) {
              openEditVmHardware({
                itemId,
                currentName: data.name,
                currentVmid: data.vm.vmid,
              })
            }
          }}
          isLoading={false}
          powerStatus={powerStatus}
        />
      )}
    </>
  )
}

export function InventoryNodeMenu({
  itemId,
  data,
  className,
  iconSize = "icon-xs",
  contentAlign,
}: {
  itemId: string
  data: ApiTreeNode
  className?: string
  iconSize?: "icon-xs" | "icon-sm" | "icon" | "icon-lg"
  contentAlign?: "start" | "center" | "end"
}) {
  const { isMobile } = useSidebar()

  if (!hasNodeActions(data)) return null

  return (
    <DropdownMenu>
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
        <InventoryNodeMenuBody itemId={itemId} data={data} />
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
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {isFolder ? (
            <FolderMenuItems
              permissions={permissions}
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
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
