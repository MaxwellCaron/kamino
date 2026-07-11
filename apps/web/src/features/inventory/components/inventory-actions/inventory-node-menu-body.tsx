import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Delete01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useInventoryFavorites } from "../../hooks/use-inventory-favorites"
import { useDeleteFolder } from "../../hooks/use-inventory-actions"
import { inventoryTreeQueryOptions } from "../../api/inventory-api"
import { findInventoryTreeNode } from "../../utils/inventory-tree"
import {
  
  
  runInventoryPowerAction
} from "../../utils/inventory-power-actions"
import { InventoryDeleteConfirmItems } from "../inventory-delete-confirm-items"
import { useInventoryDialogs } from "../inventory-dialogs-provider"
import { FolderMenuItems } from "./folder-menu-items"
import { FOLDER_POWER_ACTION_DEFINITIONS } from "./folder-power-action-definitions"
import { TemplateMenuItems } from "./template-menu-items"
import { VmMenuItems } from "./vm-menu-items"
import type {FolderPowerTargets, InventoryPowerAction} from "../../utils/inventory-power-actions";
import type { ApiTreeNode } from "../../types/inventory-types"
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
    <>
      {isFolder ? (
        <FolderMenuItems
          permissions={data.permissions}
          power={
            folderPower.canPower
              ? {
                  targetCount: folderPower.targets.length,
                  onPowerAction: handleFolderPowerAction,
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
              guestType: data.vm.guest_type,
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
          guestType={data.vm?.guest_type}
        />
      )}
    </>
  )
}
