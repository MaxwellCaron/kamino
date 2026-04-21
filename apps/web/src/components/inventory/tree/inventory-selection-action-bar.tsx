import {
  IconPlayerPlay,
  IconPlayerStop,
  IconPower,
  IconRefresh,
  IconTemplate,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import {
  ActionBar,
  ActionBarClose,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { toast } from "sonner"
import { InventoryDeletionDescription } from "../inventory-deletion-description"
import { useInventoryDialogs } from "../inventory-dialogs-provider"
import { useInventoryTreeContext } from "./inventory-tree"
import type { FolderDeletionSummary } from "@/lib/inventory-tree"
import type { ApiBulkVmMutationResponse, ApiTreeNode } from "@/lib/queries"
import { useDeleteFolder } from "@/hooks/use-inventory-actions"
import {
  useConvertToTemplate,
  useDeleteVM,
  useVmPowerAction,
} from "@/hooks/use-vm-actions"
import {
  InventoryPermissionBits,
  hasInventoryPermission,
} from "@/lib/inventory-permissions"
import { summarizeFolderDeletion } from "@/lib/inventory-tree"

type SelectedVmItem = ApiTreeNode & {
  kind: "vm"
  vm: NonNullable<ApiTreeNode["vm"]>
}

type SelectedFolderItem = ApiTreeNode & {
  kind: "folder"
}

type MutationFailure = {
  id: string
  error: string
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function getVmSelectionLabel(items: Array<SelectedVmItem>) {
  const templateCount = items.filter((item) => item.vm.is_template).length
  const vmCount = items.length - templateCount

  if (templateCount === 0) {
    return pluralize(vmCount, "VM")
  }

  if (vmCount === 0) {
    return pluralize(templateCount, "template")
  }

  return `${pluralize(vmCount, "VM")} and ${pluralize(templateCount, "template")}`
}

function getFailureMessage(failures: Array<MutationFailure>, fallback: string) {
  if (failures.length === 0) {
    return null
  }

  if (failures.length === 1) {
    return `${fallback}: ${failures[0].error}`
  }

  return `${fallback} for ${failures.length} items`
}

function collectDescendantIds(node: ApiTreeNode, descendants: Set<string>) {
  for (const child of node.children ?? []) {
    descendants.add(child.id)
    collectDescendantIds(child, descendants)
  }
}

function collectPowerVmTargets(
  node: ApiTreeNode,
  targets: Map<string, SelectedVmItem>
) {
  if (node.kind === "vm" && node.vm && !node.vm.is_template) {
    targets.set(node.id, node as SelectedVmItem)
    return
  }

  for (const child of node.children ?? []) {
    collectPowerVmTargets(child, targets)
  }
}

function appendPreviewItems(target: Array<string>, values: Array<string>) {
  for (const value of values) {
    if (target.length >= 3) {
      return
    }
    target.push(value)
  }
}

function summarizeSelectionDeletion(
  folderTargets: Array<SelectedFolderItem>,
  vmTargets: Array<SelectedVmItem>
): FolderDeletionSummary {
  const summary: FolderDeletionSummary = {
    folderCount: 0,
    vmCount: 0,
    templateCount: 0,
    folderNames: [],
    vmNames: [],
    templateNames: [],
  }

  for (const folder of folderTargets) {
    const folderSummary = summarizeFolderDeletion(folder)
    summary.folderCount += folderSummary.folderCount
    summary.vmCount += folderSummary.vmCount
    summary.templateCount += folderSummary.templateCount
    appendPreviewItems(summary.folderNames, folderSummary.folderNames)
    appendPreviewItems(summary.vmNames, folderSummary.vmNames)
    appendPreviewItems(summary.templateNames, folderSummary.templateNames)
  }

  for (const vm of vmTargets) {
    const label = `${vm.name} (${vm.vm.vmid})`

    if (vm.vm.is_template) {
      summary.templateCount += 1
      appendPreviewItems(summary.templateNames, [label])
      continue
    }

    summary.vmCount += 1
    appendPreviewItems(summary.vmNames, [label])
  }

  return summary
}

export function InventorySelectionActionBar() {
  const { clearSelection, getItemData, replaceSelection, selectedItemIds } =
    useInventoryTreeContext()
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
  const powerVmItemIds = powerVmItems.map((item) => item.id)
  const templateSelectionLabel = getVmSelectionLabel(selectedVmItems)
  const templateVmItemIds = selectedVmItems.map((item) => item.id)

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
  const deleteSummary = summarizeSelectionDeletion(
    deleteFolderTargets,
    deleteVmTargets
  )
  const deleteTargetCount = deleteFolderTargets.length + deleteVmTargets.length

  const canDelete =
    deleteTargetCount > 0 &&
    deleteFolderTargets.every((folder) =>
      hasInventoryPermission(
        folder.permissions,
        InventoryPermissionBits.deleteFolder
      )
    ) &&
    deleteVmTargets.every((item) =>
      hasInventoryPermission(item.permissions, InventoryPermissionBits.deleteVm)
    )
  const canPower =
    powerVmItems.length > 0 &&
    powerVmItems.every((item) =>
      hasInventoryPermission(item.permissions, InventoryPermissionBits.powerVm)
    )
  const canTemplate =
    !hasSelectedFolders &&
    !anySelectedTemplate &&
    selectedVmItems.every((item) =>
      hasInventoryPermission(
        item.permissions,
        InventoryPermissionBits.templateVm
      )
    )

  if (!canDelete && !canPower && !canTemplate) {
    return null
  }

  const open =
    selectedItemIds.length > 1 &&
    selectedItems.length === selectedItemIds.length

  if (!open) {
    return null
  }

  function handleVmMutationResult(
    result: ApiBulkVmMutationResponse,
    options: {
      successMessage: (count: number) => string
      failureMessage: string
    }
  ) {
    if (result.failed.length === 0) {
      clearSelection()
    } else {
      replaceSelection(result.failed.map((failure) => failure.id))
    }

    if (result.succeeded.length > 0) {
      toast.success(options.successMessage(result.succeeded.length))
    }

    const failureMessage = getFailureMessage(
      result.failed,
      options.failureMessage
    )
    if (failureMessage) {
      toast.error(failureMessage)
    }
  }

  async function runPowerAction(
    action: "start" | "shutdown" | "reboot" | "stop"
  ) {
    const loadingMessage = {
      start: `Starting ${powerSelectionLabel}…`,
      shutdown: `Shutting down ${powerSelectionLabel}…`,
      reboot: `Rebooting ${powerSelectionLabel}…`,
      stop: `Stopping ${powerSelectionLabel}…`,
    }[action]
    const failureMessage = {
      start: "Failed to start selected VMs",
      shutdown: "Failed to shut down selected VMs",
      reboot: "Failed to reboot selected VMs",
      stop: "Failed to stop selected VMs",
    }[action]
    const successMessage = {
      start: (count: number) => `${pluralize(count, "VM")} started`,
      shutdown: (count: number) => `${pluralize(count, "VM")} shut down`,
      reboot: (count: number) => `${pluralize(count, "VM")} rebooted`,
      stop: (count: number) => `${pluralize(count, "VM")} stopped`,
    }[action]

    const loadingToastId = toast.loading(loadingMessage)

    try {
      const result = await powerAction.mutateAsync({
        action,
        itemIds: powerVmItemIds,
      })
      toast.dismiss(loadingToastId)
      handleVmMutationResult(result, { successMessage, failureMessage })
    } catch (error) {
      toast.dismiss(loadingToastId)
      toast.error(error instanceof Error ? error.message : failureMessage)
      throw error
    }
  }

  async function runTemplateAction() {
    const loadingToastId = toast.loading(
      `Templatizing ${templateSelectionLabel}…`
    )

    try {
      const result = await convertToTemplate.mutateAsync({
        itemIds: templateVmItemIds,
      })
      toast.dismiss(loadingToastId)
      handleVmMutationResult(result, {
        successMessage: (count) => `${pluralize(count, "VM")} templatized`,
        failureMessage: "Failed to templatize selected VMs",
      })
    } catch (error) {
      toast.dismiss(loadingToastId)
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to templatize selected VMs"
      )
      throw error
    }
  }

  async function runDeleteAction() {
    const loadingToastId = toast.loading("Deleting selected items…")
    const failures: Array<MutationFailure> = []
    let successCount = 0

    try {
      for (const folder of deleteFolderTargets) {
        try {
          await deleteFolder.mutateAsync({ id: folder.id })
          successCount += 1
        } catch (error) {
          failures.push({
            id: folder.id,
            error:
              error instanceof Error
                ? error.message
                : "Failed to delete folder",
          })
        }
      }

      if (deleteVmTargets.length > 0) {
        const result = await deleteVm.mutateAsync({
          itemIds: deleteVmTargets.map((item) => item.id),
        })
        successCount += result.succeeded.length
        failures.push(...result.failed)
      }

      toast.dismiss(loadingToastId)

      if (failures.length === 0) {
        clearSelection()
      } else {
        replaceSelection(failures.map((failure) => failure.id))
      }

      if (successCount > 0) {
        toast.success(`${pluralize(successCount, "selected item")} deleted`)
      }

      const failureMessage = getFailureMessage(
        failures,
        "Failed to delete selected items"
      )
      if (failureMessage) {
        toast.error(failureMessage)
      }
    } catch (error) {
      toast.dismiss(loadingToastId)
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete selected items"
      )
      throw error
    }
  }

  const ignoredFoldersNote = hasSelectedFolders ? (
    <p>
      Selected folders will be resolved to their contained VMs for this action.
    </p>
  ) : null

  return (
    <ActionBar
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          clearSelection()
        }
      }}
    >
      <ActionBarSelection>
        {selectedItems.length} <span className="hidden lg:block">selected</span>
      </ActionBarSelection>
      <ActionBarSeparator />
      <ActionBarGroup>
        {canPower && (
          <>
            <ActionBarItem
              onSelect={(event) => event.preventDefault()}
              onClick={() =>
                openConfirm({
                  title: "Start",
                  icon: IconPlayerPlay,
                  description: (
                    <>
                      <p>This will power on {powerSelectionLabel}.</p>
                      {ignoredFoldersNote}
                    </>
                  ),
                  actionLabel: "Start",
                  onConfirm: () => runPowerAction("start"),
                })
              }
              aria-label="Start selected VMs"
              tooltip="Start"
              variant="default"
            >
              <IconPlayerPlay />
            </ActionBarItem>
            <ActionBarItem
              onSelect={(event) => event.preventDefault()}
              onClick={() =>
                openConfirm({
                  title: "Shutdown",
                  icon: IconPower,
                  description: (
                    <>
                      <p>
                        This will send a shutdown signal to{" "}
                        {powerSelectionLabel}.
                      </p>
                      {ignoredFoldersNote}
                    </>
                  ),
                  actionLabel: "Shutdown",
                  variant: "destructive",
                  onConfirm: () => runPowerAction("shutdown"),
                })
              }
              aria-label="Shut down selected VMs"
              tooltip="Shutdown"
            >
              <IconPower />
            </ActionBarItem>
            <ActionBarItem
              onSelect={(event) => event.preventDefault()}
              onClick={() =>
                openConfirm({
                  title: "Reboot",
                  icon: IconRefresh,
                  description: (
                    <>
                      <p>
                        This will send a reboot signal to {powerSelectionLabel}.
                      </p>
                      {ignoredFoldersNote}
                    </>
                  ),
                  actionLabel: "Reboot",
                  variant: "destructive",
                  onConfirm: () => runPowerAction("reboot"),
                })
              }
              aria-label="Reboot selected VMs"
              tooltip="Reboot"
            >
              <IconRefresh />
            </ActionBarItem>
            <ActionBarItem
              onSelect={(event) => event.preventDefault()}
              onClick={() =>
                openConfirm({
                  title: "Stop",
                  icon: IconPlayerStop,
                  description: (
                    <>
                      <p>This will immediately stop {powerSelectionLabel}.</p>
                      {ignoredFoldersNote}
                    </>
                  ),
                  actionLabel: "Stop",
                  variant: "destructive",
                  onConfirm: () => runPowerAction("stop"),
                })
              }
              aria-label="Stop selected VMs"
              tooltip="Stop"
            >
              <IconPlayerStop />
            </ActionBarItem>
          </>
        )}
        {canPower && (canTemplate || canDelete) && <ActionBarSeparator />}
        {canTemplate && (
          <>
            <ActionBarItem
              onSelect={(event) => event.preventDefault()}
              onClick={() =>
                openConfirm({
                  title: "Templatize",
                  icon: IconTemplate,
                  description: (
                    <>
                      <p>
                        This will convert {templateSelectionLabel} to templates.
                        Once converted, they can no longer be edited as VMs.
                      </p>
                      {ignoredFoldersNote}
                    </>
                  ),
                  actionLabel: "Templatize",
                  variant: "destructive",
                  onConfirm: runTemplateAction,
                })
              }
              aria-label="Templatize selected VMs"
              tooltip="Templatize"
            >
              <IconTemplate />
            </ActionBarItem>
            {canDelete && <ActionBarSeparator />}
          </>
        )}
        {canDelete && (
          <ActionBarItem
            onSelect={(event) => event.preventDefault()}
            onClick={() =>
              openConfirm({
                title: "Delete",
                icon: IconTrash,
                description: (
                  <InventoryDeletionDescription
                    folderCount={deleteSummary.folderCount}
                    vmCount={deleteSummary.vmCount}
                    templateCount={deleteSummary.templateCount}
                    folderNames={deleteSummary.folderNames}
                    vmNames={deleteSummary.vmNames}
                    templateNames={deleteSummary.templateNames}
                  />
                ),
                actionLabel: "Delete",
                variant: "destructive",
                onConfirm: runDeleteAction,
              })
            }
            aria-label="Delete selected items"
            tooltip="Delete"
            variant="destructive"
          >
            <IconTrash />
          </ActionBarItem>
        )}
      </ActionBarGroup>
      <ActionBarClose aria-label="Clear selection">
        <IconX />
      </ActionBarClose>
    </ActionBar>
  )
}
