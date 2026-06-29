import { hasDirectInventoryCapability } from "../../utils/inventory-capabilities"
import { useDeleteFolder } from "../../hooks/use-inventory-actions"
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
import type { ApiBulkVmMutationResponse } from "@/features/vms/types/vm-types"
import type { MutationResult } from "@/components/feedback/mutation-progress-toast"
import { showMutationToast } from "@/components/feedback/mutation-progress-toast"
import {
  collectInventoryDeleteItemIds,
  createInventoryDeleteItems,
} from "@/features/inventory/utils/inventory-delete-items"
import { formatVmReference } from "@/features/shared/utils/format"
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
  const deleteItems = createInventoryDeleteItems({
    folderTargets: deleteFolderTargets,
    vmTargets: deleteVmTargets,
    getVmStatus: getStatus,
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

  function runPowerAction(action: "start" | "shutdown" | "reboot" | "stop") {
    const targetItemIds = powerVmItems.map((item) => item.id)

    if (targetItemIds.length === 0) {
      return
    }

    const actionLabels = {
      start: { loading: "Starting", failure: "Failed to start selected VMs" },
      shutdown: {
        loading: "Shutting down",
        failure: "Failed to shut down selected VMs",
      },
      reboot: {
        loading: "Rebooting",
        failure: "Failed to reboot selected VMs",
      },
      stop: { loading: "Stopping", failure: "Failed to stop selected VMs" },
    }[action]

    showMutationToast({
      title: `${actionLabels.loading} ${targetItemIds.length} VM${targetItemIds.length === 1 ? "" : "s"}`,
      items: powerVmItems.map((item) => ({
        id: item.id,
        name: formatVmReference(item.vm.vmid, item.name),
      })),
      runMutation: async (): Promise<MutationResult> => {
        try {
          const result = await powerAction.mutateAsync({
            action,
            itemIds: targetItemIds,
          })
          handleVmMutationSelection(result)
          return {
            succeeded: result.succeeded,
            failed: result.failed.map((f) => ({ id: f.id, error: f.error })),
          }
        } catch (error) {
          replaceSelection(targetItemIds)
          const message =
            error instanceof Error ? error.message : actionLabels.failure
          return {
            succeeded: [],
            failed: targetItemIds.map((id) => ({ id, error: message })),
          }
        }
      },
    })
  }

  function runTemplateAction() {
    const targetItemIds: Array<string> = []
    const targetItems: Array<{
      id: string
      name: string
      successDescription: string
    }> = []
    for (const item of selectedVmItems) {
      if (item.vm.is_template) continue
      targetItemIds.push(item.id)
      targetItems.push({
        id: item.id,
        name: formatVmReference(item.vm.vmid, item.name),
        successDescription: "Converted to template",
      })
    }

    if (targetItemIds.length === 0) {
      return
    }

    showMutationToast({
      title: `Converting ${targetItemIds.length} VM${targetItemIds.length === 1 ? "" : "s"} to templates`,
      items: targetItems,
      runMutation: async (): Promise<MutationResult> => {
        try {
          const result = await convertToTemplate.mutateAsync({
            itemIds: targetItemIds,
          })
          handleVmMutationSelection(result)
          return {
            succeeded: result.succeeded,
            failed: result.failed.map((f) => ({ id: f.id, error: f.error })),
          }
        } catch (error) {
          replaceSelection(targetItemIds)
          const message =
            error instanceof Error
              ? error.message
              : "Failed to templatize selected VMs"
          return {
            succeeded: [],
            failed: targetItemIds.map((id) => ({ id, error: message })),
          }
        }
      },
    })
  }

  function runDeleteAction() {
    if (deleteItems.length === 0) {
      return
    }

    showMutationToast({
      title: `Deleting ${deleteItems.length} item${deleteItems.length === 1 ? "" : "s"}`,
      items: deleteItems.map(({ id, name, successDescription }) => ({
        id,
        name,
        successDescription,
      })),
      runMutation: async (): Promise<MutationResult> => {
        const succeeded: Array<string> = []
        const failed: Array<{ id: string; error: string }> = []
        const failedSelectionIds: Array<string> = []

        await Promise.all(
          deleteFolderTargets.map(async (folder) => {
            const folderItemIds = collectInventoryDeleteItemIds(folder)

            try {
              await deleteFolder.mutateAsync({ id: folder.id })
              succeeded.push(...folderItemIds)
            } catch (error) {
              failedSelectionIds.push(folder.id)
              failed.push(
                ...folderItemIds.map((id) => ({
                  id,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to delete folder",
                }))
              )
            }
          })
        )

        const vmIds = deleteVmTargets.map((item) => item.id)
        if (vmIds.length > 0) {
          try {
            const result: ApiBulkVmMutationResponse =
              await deleteVm.mutateAsync({ itemIds: vmIds })
            succeeded.push(...result.succeeded)
            failed.push(
              ...result.failed.map((f) => ({ id: f.id, error: f.error }))
            )
            failedSelectionIds.push(
              ...result.failed.map((failure) => failure.id)
            )
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Failed to delete VMs"
            vmIds.forEach((id) => failed.push({ id, error: message }))
            failedSelectionIds.push(...vmIds)
          }
        }

        if (failedSelectionIds.length === 0) {
          clearSelection()
        } else {
          replaceSelection(failedSelectionIds)
        }

        return { succeeded, failed }
      },
    })
  }

  return {
    canDelete,
    canPower,
    canTemplate,
    clearSelection,
    deleteItems,
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
