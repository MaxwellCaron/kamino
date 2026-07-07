import { useQueryClient } from "@tanstack/react-query"
import { hasDirectInventoryCapability } from "../../utils/inventory-capabilities"
import { useDeleteFolder } from "../../hooks/use-inventory-actions"
import { useInventoryDialogs } from "../inventory-dialogs-provider"
import { useInventoryTreeContext } from "./inventory-tree-context"
import {
  collectDescendantIds,
  collectPowerVmTargets,
  getVmSelectionLabel,
} from "./inventory-selection-action-bar-utils"
import type { QueryClient } from "@tanstack/react-query"
import type {
  ApiTreeNode,
  SelectedFolderItem,
  SelectedVmItem,
} from "../../types/inventory-types"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"
import {
  collectInventoryDeleteItemIds,
  createInventoryDeleteItems,
} from "@/features/inventory/utils/inventory-delete-items"
import { formatVmReference } from "@/features/shared/utils/format"
import { vmPowerAction, vmStatusQueryOptions } from "@/features/vms/api/vm-api"
import {
  useConvertToTemplate,
  useDeleteVM,
} from "@/features/vms/hooks/use-vm-actions"

const VM_STATUS_POLL_INTERVAL_MS = 2_000

function startVmStatusPolling(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: vmStatusQueryOptions.queryKey })
  const handle = window.setInterval(() => {
    void queryClient.invalidateQueries({
      queryKey: vmStatusQueryOptions.queryKey,
    })
  }, VM_STATUS_POLL_INTERVAL_MS)
  return () => window.clearInterval(handle)
}

export function useInventorySelectionActions() {
  const {
    clearSelection,
    getItemData,
    getStatus,
    replaceSelection,
    selectedItemIds,
  } = useInventoryTreeContext()
  const { openConfirm } = useInventoryDialogs()
  const queryClient = useQueryClient()
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

    const stopPolling = startVmStatusPolling(queryClient)

    showUnitMutationToast({
      title: `${actionLabels.loading} ${targetItemIds.length} VM${targetItemIds.length === 1 ? "" : "s"}`,
      units: powerVmItems.map((item) => ({
        items: [
          {
            id: item.id,
            name: formatVmReference(item.vm.vmid, item.name),
          },
        ],
        run: async () => {
          try {
            const result = await vmPowerAction({
              action,
              itemIds: [item.id],
            })
            if (result.succeeded.length > 0) {
              void queryClient.invalidateQueries({
                queryKey: vmStatusQueryOptions.queryKey,
              })
            }
            return { failed: result.failed }
          } catch (error) {
            return {
              failed: [
                {
                  id: item.id,
                  error:
                    error instanceof Error
                      ? error.message
                      : actionLabels.failure,
                },
              ],
            }
          }
        },
      })),
      onSettled: (result) => {
        stopPolling()
        void queryClient.invalidateQueries({
          queryKey: vmStatusQueryOptions.queryKey,
        })
        if (result.failed.length === 0) {
          clearSelection()
        } else {
          replaceSelection(result.failed.map((failure) => failure.id))
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

    showUnitMutationToast({
      title: `Converting ${targetItemIds.length} VM${targetItemIds.length === 1 ? "" : "s"} to templates`,
      units: targetItems.map((item) => ({
        items: [item],
        run: async () => {
          const result = await convertToTemplate.mutateAsync({
            itemIds: [item.id],
          })
          return { failed: result.failed }
        },
      })),
      onSettled: (result) => {
        if (result.failed.length === 0) {
          clearSelection()
        } else {
          replaceSelection(result.failed.map((failure) => failure.id))
        }
      },
    })
  }

  function runDeleteAction() {
    if (deleteItems.length === 0) {
      return
    }

    const folderItemIdToFolderId = new Map<string, string>()
    for (const folder of deleteFolderTargets) {
      for (const itemId of collectInventoryDeleteItemIds(folder)) {
        folderItemIdToFolderId.set(itemId, folder.id)
      }
    }
    const deleteVmTargetIds = new Set(deleteVmTargets.map((vm) => vm.id))

    showUnitMutationToast({
      title: `Deleting ${deleteItems.length} item${deleteItems.length === 1 ? "" : "s"}`,
      units: [
        ...deleteFolderTargets.map((folder) => ({
          items: createInventoryDeleteItems({
            folderTargets: [folder],
            vmTargets: [],
            getVmStatus: getStatus,
          }).map(({ id, name, successDescription }) => ({
            id,
            name,
            successDescription,
          })),
          run: async () => {
            await deleteFolder.mutateAsync({ id: folder.id })
          },
        })),
        ...deleteVmTargets.map((item) => ({
          items: [
            {
              id: item.id,
              name: formatVmReference(item.vm.vmid, item.name),
              successDescription: "Deleted",
            },
          ],
          run: async () => {
            const result = await deleteVm.mutateAsync({ itemIds: [item.id] })
            return { failed: result.failed }
          },
        })),
      ],
      onSettled: (result) => {
        const failedSelectionIds = new Set<string>()

        for (const failure of result.failed) {
          const folderId = folderItemIdToFolderId.get(failure.id)
          if (folderId !== undefined) {
            failedSelectionIds.add(folderId)
          } else if (deleteVmTargetIds.has(failure.id)) {
            failedSelectionIds.add(failure.id)
          }
        }

        if (failedSelectionIds.size === 0) {
          clearSelection()
        } else {
          replaceSelection([...failedSelectionIds])
        }
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
