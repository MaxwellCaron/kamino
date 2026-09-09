import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Delete01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"
import { useInventoryFavorites } from "../../hooks/use-inventory-favorites"
import { useDeleteFolder } from "../../hooks/use-inventory-actions"
import { inventoryTreeQueryOptions } from "../../api/inventory-api"
import { findInventoryTreeNode } from "../../utils/inventory-tree"
import { runInventoryPowerAction } from "../../utils/inventory-power-actions"
import { InventoryDeleteConfirmItems } from "../inventory-delete-confirm-items"
import { useInventoryDialogs } from "../inventory-dialogs-context"
import { getFolderCapabilities } from "../../utils/inventory-capabilities"
import { FolderMenuItems } from "./folder-menu-items"
import { FOLDER_POWER_ACTION_DEFINITIONS } from "./folder-power-action-definitions"
import { TemplateMenuItems } from "./template-menu-items"
import { VmMenuItems } from "./vm-menu-items"
import type {
  FolderPowerTargets,
  InventoryPowerAction,
} from "../../utils/inventory-power-actions"
import type { ApiTreeNode } from "../../types/inventory-types"
import type { InventoryDialogsContextValue } from "../inventory-dialogs-context"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"
import { formatVmReference } from "@/features/shared/utils/format"
import { VmIcon } from "@/components/status/vm-icon"
import { createInventoryDeleteItems } from "@/features/inventory/utils/inventory-delete-items"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"

export function InventoryNodeMenuBody({
  itemId,
  data,
  folderPower,
}: {
  itemId: string
  data: ApiTreeNode
  folderPower: FolderPowerTargets
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
    openMigrateVm,
    openRenameVm,
    openEditVmHardware,
    openPermissions,
  } = useInventoryDialogs()
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)

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

  function handleFolderPowerAction(action: InventoryPowerAction) {
    const { targets } = folderPower
    if (targets.length === 0) return

    const definition = FOLDER_POWER_ACTION_DEFINITIONS.find(
      (item) => item.action === action
    )!
    const count = `${targets.length} VM${targets.length === 1 ? "" : "s"}`

    openConfirm({
      title: definition.label,
      icon: definition.icon,
      description: definition.description(count, data.name),
      body: (
        <InventoryDeleteConfirmItems
          items={targets.map((item) => ({
            id: item.id,
            name: formatVmReference(item.vm.vmid, item.name),
            icon: (
              <VmIcon
                status={vmStatuses?.[item.vm.vmid]}
                guestType={item.vm.guest_type}
              />
            ),
          }))}
        />
      ),
      actionLabel: definition.label,
      variant: definition.dialogVariant,
      onConfirm: () => {
        runInventoryPowerAction({ queryClient, action, targets })
      },
    })
  }

  return (
    <InventoryNodeMenuItems
      data={data}
      dialogs={{
        openConfirm,
        openCreateFolder,
        openFolderLimit,
        openRenameFolder,
        openCreateVm,
        openSnapshot,
        openClone,
        openMigrateVm,
        openRenameVm,
        openEditVmHardware,
        openPermissions,
      }}
      favoriteIds={favoriteIds}
      folderPower={folderPower}
      itemId={itemId}
      onDeleteFolder={handleDeleteFolder}
      onFolderPowerAction={handleFolderPowerAction}
      onToggleFavorite={toggleFavorite}
      vmStatuses={vmStatuses}
    />
  )
}

function InventoryNodeMenuItems({
  data,
  dialogs,
  favoriteIds,
  folderPower,
  itemId,
  onDeleteFolder,
  onFolderPowerAction,
  onToggleFavorite,
  vmStatuses,
}: {
  data: ApiTreeNode
  dialogs: InventoryDialogsContextValue
  favoriteIds: ReadonlySet<string>
  folderPower: FolderPowerTargets
  itemId: string
  onDeleteFolder: () => void
  onFolderPowerAction: (action: InventoryPowerAction) => void
  onToggleFavorite: (itemId: string) => void
  vmStatuses?: Record<number, string>
}) {
  const {
    openClone,
    openConfirm,
    openCreateFolder,
    openCreateVm,
    openEditVmHardware,
    openFolderLimit,
    openMigrateVm,
    openPermissions,
    openRenameFolder,
    openRenameVm,
    openSnapshot,
  } = dialogs

  if (data.kind === "folder") {
    const capabilities = getFolderCapabilities(data.permissions)
    const hasActions =
      capabilities.hasCreateActions ||
      capabilities.hasEditActions ||
      capabilities.delete.visible ||
      (folderPower.canPower && folderPower.targets.length > 0)

    if (!hasActions) return <InventoryMenuEmptyState />

    return (
      <FolderMenuItems
        permissions={data.permissions}
        power={
          folderPower.canPower
            ? {
                targetCount: folderPower.targets.length,
                onPowerAction: onFolderPowerAction,
              }
            : null
        }
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
          openRenameFolder({
            folderId: itemId,
            currentName: data.name,
            currentDescription: data.description,
          })
        }
        onDelete={onDeleteFolder}
        disabled={false}
      />
    )
  }

  const isFavorite = favoriteIds.has(itemId)
  const managePermissions = () =>
    openPermissions({
      itemId,
      itemKind: "vm",
      itemName: data.name,
      itemVmid: data.vm?.vmid,
    })
  const clone = () => {
    if (!data.vm?.node) return
    openClone({
      itemId,
      currentName: data.name,
      currentVmid: data.vm.vmid,
      isTemplate: data.vm.is_template,
    })
  }
  const rename = () => {
    if (!data.vm?.node) return
    openRenameVm({
      itemId,
      currentName: data.name,
      currentVmid: data.vm.vmid,
    })
  }

  if (data.vm?.is_template) {
    return (
      <TemplateMenuItems
        permissions={data.permissions}
        isFavorite={isFavorite}
        onToggleFavorite={() => onToggleFavorite(itemId)}
        itemId={itemId}
        vmid={data.vm.vmid}
        name={data.name}
        onAction={openConfirm}
        onManagePermissions={managePermissions}
        onClone={clone}
        onRename={rename}
        disabled={false}
      />
    )
  }

  return (
    <VmMenuItems
      permissions={data.permissions}
      isFavorite={isFavorite}
      onToggleFavorite={() => onToggleFavorite(itemId)}
      itemId={itemId}
      vmid={data.vm?.vmid ?? 0}
      name={data.name}
      onAction={openConfirm}
      onManagePermissions={managePermissions}
      onSnapshot={(mode) => {
        if (data.vm?.vmid == null) return
        openSnapshot({
          itemId,
          currentName: data.name,
          currentVmid: data.vm.vmid,
          guestType: data.vm.guest_type,
          mode,
        })
      }}
      onClone={clone}
      onMigrate={() => {
        if (!data.vm?.node) return
        openMigrateVm({
          items: [
            {
              id: itemId,
              name: data.name,
              node: data.vm.node,
              vmid: data.vm.vmid,
            },
          ],
        })
      }}
      onRename={rename}
      onEditHardware={() => {
        if (!data.vm?.node) return
        openEditVmHardware({
          itemId,
          currentName: data.name,
          currentVmid: data.vm.vmid,
        })
      }}
      disabled={false}
      powerStatus={data.vm ? vmStatuses?.[data.vm.vmid] : undefined}
      guestType={data.vm?.guest_type}
    />
  )
}

export function InventoryMenuEmptyState() {
  return (
    <DropdownMenuGroup>
      <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
    </DropdownMenuGroup>
  )
}
