import { hasDirectInventoryCapability } from "../../utils/inventory-capabilities"
import { useDeleteFolder } from "../../hooks/use-inventory-actions"
import {
  applyPowerMutationStatuses,
  applyVmMutationStatuses,
  collectInventoryDeleteStatusIds,
  createInventoryDeleteStatusItems,
  createPowerConfirmStatusItems,
  createTemplateConfirmStatusItems,
  getPendingStatusItems,
  markStatusItems,
} from "../../utils/inventory-status-items"
import { useInventoryDialogs } from "../inventory-dialogs-provider"
import { useInventoryTreeContext } from "./inventory-tree-context"
import {
  collectDescendantIds,
  collectPowerVmTargets,
  getVmSelectionLabel,
} from "./inventory-selection-action-bar-utils"
import type {
  ApiTreeNode,
  SelectedFolderItem,
  SelectedVmItem,
} from "../../types/inventory-types"
import type { ConfirmDialogControls } from "@/components/dialogs/confirm-dialog"
import type { ApiBulkVmMutationResponse } from "@/features/vms/types/vm-types"
import {
  useConvertToTemplate,
  useDeleteVM,
  useVmPowerAction,
} from "@/features/vms/hooks/use-vm-actions"

export function useInventorySelectionActions() {
  const {
    clearSelection,
    getItemData,
    getStatus,
    replaceSelection,
    selectedItemIds,
  } = useInventoryTreeContext()
  const { openConfirm } = useInventoryDialogs()
  const powerAction = useVmPowerAction()
  const deleteVm = useDeleteVM()
  const deleteFolder = useDeleteFolder()
  const convertToTemplate = useConvertToTemplate()

  const selectedItems = selectedItemIds
    .map((itemId) => getItemData(itemId))
    .filter((item): item is ApiTreeNode => item !== undefined)
  const selectedVmItems = selectedItems.filter(
    (item): item is SelectedVmItem =>
      item.kind === "vm" && item.vm !== undefined
  )
  const selectedFolderItems = selectedItems.filter(
    (item): item is SelectedFolderItem => item.kind === "folder"
  )

  const hasSelectedFolders = selectedFolderItems.length > 0
  const anySelectedTemplate = selectedVmItems.some(
    (item) => item.vm.is_template
  )

  const powerVmTargets = new Map<string, SelectedVmItem>()
  for (const item of selectedVmItems) {
    if (!item.vm.is_template) {
      powerVmTargets.set(item.id, item)
    }
  }
  for (const folder of selectedFolderItems) {
    collectPowerVmTargets(folder, powerVmTargets)
  }

  const powerVmItems = Array.from(powerVmTargets.values())
  const powerSelectionLabel = getVmSelectionLabel(powerVmItems)
  const templateSelectionLabel = getVmSelectionLabel(selectedVmItems)

  const coveredBySelectedFolders = new Set<string>()
  for (const folder of selectedFolderItems) {
    collectDescendantIds(folder, coveredBySelectedFolders)
  }

  const deleteFolderTargets = selectedFolderItems.filter(
    (folder) => !coveredBySelectedFolders.has(folder.id)
  )
  const deleteVmTargets = selectedVmItems.filter(
    (item) => !coveredBySelectedFolders.has(item.id)
  )
  const deleteStatusItems = createInventoryDeleteStatusItems({
    folderTargets: deleteFolderTargets,
    vmTargets: deleteVmTargets,
    getVmStatus: (node) => getStatus(node.id),
  })
  const deleteTargetCount = deleteFolderTargets.length + deleteVmTargets.length

  const canDelete =
    deleteTargetCount > 0 &&
    deleteFolderTargets.every((folder) =>
      hasDirectInventoryCapability(folder.permissions, "deleteFolder")
    ) &&
    deleteVmTargets.every((item) =>
      hasDirectInventoryCapability(item.permissions, "deleteVm")
    )
  const canPower =
    powerVmItems.length > 0 &&
    powerVmItems.every((item) =>
      hasDirectInventoryCapability(item.permissions, "powerVm")
    )
  const canTemplate =
    !hasSelectedFolders &&
    !anySelectedTemplate &&
    selectedVmItems.every((item) =>
      hasDirectInventoryCapability(item.permissions, "templateVm")
    )

  const open =
    selectedItemIds.length > 1 &&
    selectedItems.length === selectedItemIds.length

  function handleVmMutationSelection(result: ApiBulkVmMutationResponse) {
    if (result.failed.length === 0) {
      clearSelection()
    } else {
      replaceSelection(result.failed.map((failure) => failure.id))
    }
  }

  async function runPowerAction(
    action: "start" | "shutdown" | "reboot" | "stop",
    controls: ConfirmDialogControls
  ) {
    const targetItemIds = getPendingStatusItems(
      controls.getStatusItems(),
      "vm"
    ).map((item) => item.id)

    if (targetItemIds.length === 0) {
      return
    }

    const failureMessage = {
      start: "Failed to start selected VMs",
      shutdown: "Failed to shut down selected VMs",
      reboot: "Failed to reboot selected VMs",
      stop: "Failed to stop selected VMs",
    }[action]

    controls.setStatusItems((items) =>
      markStatusItems(items, targetItemIds, "pending")
    )

    try {
      const result = await powerAction.mutateAsync({
        action,
        itemIds: targetItemIds,
      })
      handleVmMutationSelection(result)
      controls.setStatusItems((items) =>
        applyPowerMutationStatuses(items, targetItemIds, result)
      )
    } catch (error) {
      replaceSelection(targetItemIds)
      controls.setStatusItems((items) =>
        markStatusItems(
          items,
          targetItemIds,
          "error",
          error instanceof Error ? error.message : failureMessage
        )
      )
    }
  }

  async function runTemplateAction(controls: ConfirmDialogControls) {
    const targetItemIds = getPendingStatusItems(
      controls.getStatusItems(),
      "vm"
    ).map((item) => item.id)

    if (targetItemIds.length === 0) {
      return
    }

    controls.setStatusItems((items) =>
      markStatusItems(items, targetItemIds, "pending")
    )

    try {
      const result = await convertToTemplate.mutateAsync({
        itemIds: targetItemIds,
      })
      handleVmMutationSelection(result)
      controls.setStatusItems((items) =>
        applyVmMutationStatuses(items, targetItemIds, result)
      )
    } catch (error) {
      replaceSelection(targetItemIds)
      controls.setStatusItems((items) =>
        markStatusItems(
          items,
          targetItemIds,
          "error",
          error instanceof Error
            ? error.message
            : "Failed to templatize selected VMs"
        )
      )
    }
  }

  async function runDeleteAction(controls: ConfirmDialogControls) {
    const currentStatusItems = controls.getStatusItems()
    const statusById = new Map(
      currentStatusItems.map((item) => [item.id, item])
    )
    const isRowPending = (id: string) => statusById.get(id)?.status !== "success"

    const activeFolderTargets = deleteFolderTargets.filter((folder) =>
      isRowPending(folder.id)
    )
    const activeVmTargets = deleteVmTargets.filter((item) =>
      isRowPending(item.id)
    )

    const activeFolderRowIds = activeFolderTargets.flatMap((folder) =>
      collectInventoryDeleteStatusIds(folder)
    )
    const activeVmRowIds = activeVmTargets.map((item) => item.id)

    controls.setStatusItems((items) =>
      markStatusItems(
        items,
        [...activeFolderRowIds, ...activeVmRowIds],
        "pending"
      )
    )

    const failures: Array<string> = []

    await Promise.all(
      activeFolderTargets.map(async (folder) => {
        const folderRowIds = collectInventoryDeleteStatusIds(folder)

        try {
          await deleteFolder.mutateAsync({ id: folder.id })
          controls.setStatusItems((items) =>
            markStatusItems(items, folderRowIds, "success")
          )
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to delete folder"
          controls.setStatusItems((items) =>
            markStatusItems(items, folderRowIds, "error", message)
          )
          failures.push(folder.id)
        }
      })
    )

    if (activeVmTargets.length > 0) {
      try {
        const result = await deleteVm.mutateAsync({
          itemIds: activeVmRowIds,
        })

        for (const failure of result.failed) {
          failures.push(failure.id)
        }

        controls.setStatusItems((items) =>
          applyVmMutationStatuses(items, activeVmRowIds, result)
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete VMs"
        controls.setStatusItems((items) =>
          markStatusItems(items, activeVmRowIds, "error", message)
        )
        failures.push(...activeVmRowIds)
      }
    }

    if (failures.length === 0) {
      clearSelection()
    } else {
      replaceSelection(failures)
    }
  }

  return {
    canDelete,
    canPower,
    canTemplate,
    clearSelection,
    createPowerConfirmStatusItems,
    createTemplateConfirmStatusItems,
    deleteStatusItems,
    getStatus,
    open,
    openConfirm,
    powerSelectionLabel,
    powerVmItems,
    runDeleteAction,
    runPowerAction,
    runTemplateAction,
    selectedItems,
    selectedVmItems,
    templateSelectionLabel,
  }
}
