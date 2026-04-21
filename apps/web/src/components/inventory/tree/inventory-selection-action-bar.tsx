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
import { InventoryDeletionDescription } from "../inventory-deletion-description"
import { useInventoryDialogs } from "../inventory-dialogs-provider"
import { useInventoryTreeContext } from "./inventory-tree"
import type {
  ConfirmDialogControls,
  ConfirmStatusItem,
} from "../inventory-confirm-actions"
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
import { formatVmReference } from "@/lib/utils"

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

function getPowerSuccessStatus(
  action: "start" | "shutdown" | "reboot" | "stop"
) {
  return action === "shutdown" || action === "stop" ? "stopped" : "running"
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

function getResultItemLabel(item: SelectedFolderItem | SelectedVmItem) {
  return item.kind === "vm"
    ? formatVmReference(item.vm.vmid, item.name)
    : item.name
}

function createConfirmStatusItems(
  items: Array<SelectedFolderItem | SelectedVmItem>
): Array<ConfirmStatusItem> {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    label: getResultItemLabel(item),
    status: "idle",
  }))
}

function createPowerConfirmStatusItems(
  items: Array<SelectedVmItem>,
  action: "start" | "shutdown" | "reboot" | "stop",
  getStatus: (itemId: string) => string | undefined
): Array<ConfirmStatusItem> {
  return items.map((item) => ({
    id: item.id,
    kind: "vm",
    label: getResultItemLabel(item),
    status: "idle",
    vmid: item.vm.vmid,
    vmStatus: getStatus(item.id),
    isTemplate: false,
    successVmStatus: getPowerSuccessStatus(action),
    successIsTemplate: false,
    successDisplay: "vm",
  }))
}

function createTemplateConfirmStatusItems(
  items: Array<SelectedVmItem>,
  getStatus: (itemId: string) => string | undefined
): Array<ConfirmStatusItem> {
  return items.map((item) => ({
    id: item.id,
    kind: "vm",
    label: getResultItemLabel(item),
    status: "idle",
    vmid: item.vm.vmid,
    vmStatus: getStatus(item.id),
    isTemplate: false,
    successVmStatus: getStatus(item.id),
    successIsTemplate: true,
    successDisplay: "vm",
  }))
}

function createDeleteConfirmStatusItems(
  folderTargets: Array<SelectedFolderItem>,
  vmTargets: Array<SelectedVmItem>,
  getStatus: (itemId: string) => string | undefined
): Array<ConfirmStatusItem> {
  return [
    ...createConfirmStatusItems(folderTargets),
    ...vmTargets.map((item) => ({
      id: item.id,
      kind: "vm" as const,
      label: getResultItemLabel(item),
      status: "idle" as const,
      vmid: item.vm.vmid,
      vmStatus: getStatus(item.id),
      isTemplate: item.vm.is_template,
      successDisplay: "deleted" as const,
    })),
  ]
}

function markStatusItems(
  items: Array<ConfirmStatusItem>,
  itemIds: Array<string>,
  status: ConfirmStatusItem["status"],
  error?: string
) {
  const targetIds = new Set(itemIds)

  return items.map((item) =>
    targetIds.has(item.id) ? { ...item, status, error } : item
  )
}

function applyVmMutationStatuses(
  items: Array<ConfirmStatusItem>,
  itemIds: Array<string>,
  result: ApiBulkVmMutationResponse
) {
  const targetIds = new Set(itemIds)
  const failedById = new Map(
    result.failed.map((failure) => [failure.id, failure.error])
  )

  return items.map((item) => {
    if (!targetIds.has(item.id)) {
      return item
    }

    const error = failedById.get(item.id)
    return error
      ? { ...item, status: "error" as const, error }
      : { ...item, status: "success" as const, error: undefined }
  })
}

function applyPowerMutationStatuses(
  items: Array<ConfirmStatusItem>,
  itemIds: Array<string>,
  result: ApiBulkVmMutationResponse
) {
  const targetIds = new Set(itemIds)
  const failedById = new Map(
    result.failed.map((failure) => [failure.id, failure.error])
  )

  return items.map((item) => {
    if (!targetIds.has(item.id)) {
      return item
    }

    const error = failedById.get(item.id)
    return error ? { ...item, status: "error" as const, error } : item
  })
}

function getPendingStatusItems(
  items: Array<ConfirmStatusItem>,
  kind?: ConfirmStatusItem["kind"]
) {
  return items.filter(
    (item) => item.status !== "success" && (!kind || item.kind === kind)
  )
}

export function InventorySelectionActionBar() {
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
    const pendingStatusItems = getPendingStatusItems(controls.getStatusItems())
    const targetFolderIds = pendingStatusItems
      .filter((item) => item.kind === "folder")
      .map((item) => item.id)
    const targetVmItemIds = pendingStatusItems
      .filter((item) => item.kind === "vm")
      .map((item) => item.id)

    if (targetFolderIds.length === 0 && targetVmItemIds.length === 0) {
      return
    }

    controls.setStatusItems((items) =>
      markStatusItems(
        items,
        [...targetFolderIds, ...targetVmItemIds],
        "pending"
      )
    )
    const failures: Array<MutationFailure> = []

    for (const folderId of targetFolderIds) {
      try {
        await deleteFolder.mutateAsync({ id: folderId })
        controls.setStatusItems((items) =>
          markStatusItems(items, [folderId], "success")
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete folder"
        failures.push({
          id: folderId,
          error: message,
        })
        controls.setStatusItems((items) =>
          markStatusItems(items, [folderId], "error", message)
        )
      }
    }

    if (targetVmItemIds.length > 0) {
      try {
        const result = await deleteVm.mutateAsync({
          itemIds: targetVmItemIds,
        })
        failures.push(...result.failed)
        controls.setStatusItems((items) =>
          applyVmMutationStatuses(items, targetVmItemIds, result)
        )
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to delete selected VMs"
        failures.push(
          ...targetVmItemIds.map((id) => ({
            id,
            error: message,
          }))
        )
        controls.setStatusItems((items) =>
          markStatusItems(items, targetVmItemIds, "error", message)
        )
      }
    }

    const failedIds = Array.from(new Set(failures.map((failure) => failure.id)))
    if (failedIds.length === 0) {
      clearSelection()
    } else {
      replaceSelection(failedIds)
    }
  }

  if (!(open && (canDelete || canPower || canTemplate))) {
    return null
  }

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
                  description: <p>This will power on {powerSelectionLabel}.</p>,
                  actionLabel: "Start",
                  closeOnSuccess: false,
                  statusItems: createPowerConfirmStatusItems(
                    powerVmItems,
                    "start",
                    getStatus
                  ),
                  onConfirm: (controls) => runPowerAction("start", controls),
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
                    <p>
                      This will send a shutdown signal to {powerSelectionLabel}.
                    </p>
                  ),
                  actionLabel: "Shutdown",
                  closeOnSuccess: false,
                  statusItems: createPowerConfirmStatusItems(
                    powerVmItems,
                    "shutdown",
                    getStatus
                  ),
                  variant: "destructive",
                  onConfirm: (controls) => runPowerAction("shutdown", controls),
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
                    <p>
                      This will send a reboot signal to {powerSelectionLabel}.
                    </p>
                  ),
                  actionLabel: "Reboot",
                  closeOnSuccess: false,
                  statusItems: createPowerConfirmStatusItems(
                    powerVmItems,
                    "reboot",
                    getStatus
                  ),
                  variant: "destructive",
                  onConfirm: (controls) => runPowerAction("reboot", controls),
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
                    <p>This will immediately stop {powerSelectionLabel}.</p>
                  ),
                  actionLabel: "Stop",
                  closeOnSuccess: false,
                  statusItems: createPowerConfirmStatusItems(
                    powerVmItems,
                    "stop",
                    getStatus
                  ),
                  variant: "destructive",
                  onConfirm: (controls) => runPowerAction("stop", controls),
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
                    <p>
                      This will convert {templateSelectionLabel} to templates.
                      Once converted, they can no longer be edited as VMs.
                    </p>
                  ),
                  actionLabel: "Templatize",
                  closeOnSuccess: false,
                  statusItems: createTemplateConfirmStatusItems(
                    selectedVmItems,
                    getStatus
                  ),
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
                closeOnSuccess: false,
                statusItems: createDeleteConfirmStatusItems(
                  deleteFolderTargets,
                  deleteVmTargets,
                  getStatus
                ),
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
