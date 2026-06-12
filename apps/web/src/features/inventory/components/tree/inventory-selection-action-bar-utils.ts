import { summarizeFolderDeletion } from "../../utils/inventory-tree"
import type { ConfirmStatusItem } from "@/components/dialogs/confirm-dialog"
import type {
  ApiBulkVmMutationFailure,
  ApiBulkVmMutationResponse,
} from "@/features/vms/types/vm-types"
import type { FolderDeletionSummary } from "../../utils/inventory-tree"
import type { ApiTreeNode } from "../../types/inventory-types"
import { formatVmReference } from "@/features/shared/utils/format"

export type SelectedVmItem = ApiTreeNode & {
  kind: "vm"
  vm: NonNullable<ApiTreeNode["vm"]>
}

export type SelectedFolderItem = ApiTreeNode & {
  kind: "folder"
}

export function getPowerSuccessStatus(
  action: "start" | "shutdown" | "reboot" | "stop"
) {
  return action === "shutdown" || action === "stop" ? "stopped" : "running"
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function getVmSelectionLabel(items: Array<SelectedVmItem>) {
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

export function collectDescendantIds(
  node: ApiTreeNode,
  descendants: Set<string>
) {
  for (const child of node.children ?? []) {
    descendants.add(child.id)
    collectDescendantIds(child, descendants)
  }
}

export function collectPowerVmTargets(
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

export function summarizeSelectionDeletion(
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

export function createPowerConfirmStatusItems(
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

export function createTemplateConfirmStatusItems(
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

export function markStatusItems(
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

export function applyVmMutationStatuses(
  items: Array<ConfirmStatusItem>,
  itemIds: Array<string>,
  result: ApiBulkVmMutationResponse
): Array<ConfirmStatusItem> {
  const targetIds = new Set(itemIds)
  const failedById = new Map<string, string>(
    result.failed.map((failure: ApiBulkVmMutationFailure) => [
      failure.id,
      failure.error,
    ])
  )

  return items.map((item: ConfirmStatusItem): ConfirmStatusItem => {
    if (!targetIds.has(item.id)) {
      return item
    }

    const error = failedById.get(item.id)
    return error
      ? { ...item, status: "error" as const, error }
      : { ...item, status: "success" as const, error: undefined }
  })
}

export function applyPowerMutationStatuses(
  items: Array<ConfirmStatusItem>,
  itemIds: Array<string>,
  result: ApiBulkVmMutationResponse
): Array<ConfirmStatusItem> {
  const targetIds = new Set(itemIds)
  const failedById = new Map<string, string>(
    result.failed.map((failure: ApiBulkVmMutationFailure) => [
      failure.id,
      failure.error,
    ])
  )

  return items.map((item: ConfirmStatusItem): ConfirmStatusItem => {
    if (!targetIds.has(item.id)) {
      return item
    }

    const error = failedById.get(item.id)
    return error ? { ...item, status: "error" as const, error } : item
  })
}

export function getPendingStatusItems(
  items: Array<ConfirmStatusItem>,
  kind?: ConfirmStatusItem["kind"]
) {
  return items.filter(
    (item) => item.status !== "success" && (!kind || item.kind === kind)
  )
}
