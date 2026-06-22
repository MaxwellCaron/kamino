import type { ConfirmStatusItem } from "@/components/dialogs/confirm-dialog"
import type {
  ApiTreeNode,
  SelectedFolderItem,
  SelectedVmItem,
} from "../types/inventory-types"
import type {
  ApiBulkVmMutationFailure,
  ApiBulkVmMutationResponse,
} from "@/features/vms/types/vm-types"
import { formatVmReference } from "@/features/shared/utils/format"

type FolderDeleteTarget = ApiTreeNode & { kind: "folder" }
type VmDeleteTarget = ApiTreeNode & {
  kind: "vm"
  vm: NonNullable<ApiTreeNode["vm"]>
}

export function collectInventoryDeleteStatusIds(node: ApiTreeNode) {
  const ids: Array<string> = []

  function visit(current: ApiTreeNode) {
    ids.push(current.id)
    for (const child of current.children ?? []) {
      visit(child)
    }
  }

  visit(node)
  return ids
}

export function createInventoryDeleteStatusItems({
  folderTargets,
  vmTargets,
  getVmStatus,
}: {
  folderTargets: Array<FolderDeleteTarget>
  vmTargets: Array<VmDeleteTarget>
  getVmStatus: (node: VmDeleteTarget) => string | undefined
}): Array<ConfirmStatusItem> {
  const items: Array<ConfirmStatusItem> = []

  function visit(node: ApiTreeNode) {
    if (node.kind === "folder") {
      items.push({
        id: node.id,
        kind: "folder",
        label: node.name,
        status: "idle",
        successDisplay: "deleted",
      })

      for (const child of node.children ?? []) {
        visit(child)
      }
      return
    }

    if (!node.vm) return

    const vmNode = node as VmDeleteTarget

    items.push({
      id: node.id,
      kind: "vm",
      label: formatVmReference(node.vm.vmid, node.name),
      status: "idle",
      vmid: node.vm.vmid,
      vmStatus: getVmStatus(vmNode),
      isTemplate: node.vm.is_template,
      successDisplay: "deleted",
    })
  }

  for (const folder of folderTargets) visit(folder)
  for (const vm of vmTargets) visit(vm)

  return items
}

function getPowerSuccessStatus(
  action: "start" | "shutdown" | "reboot" | "stop"
) {
  return action === "shutdown" || action === "stop" ? "stopped" : "running"
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
