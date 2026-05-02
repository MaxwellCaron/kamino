import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import {
  formatRequestKind,
  formatRequestPowerAction,
} from "@/features/requests/utils/request-presenters"
import { formatVmReference } from "@/features/shared/utils/format"

export function getRequestTitle(request: ApiRequestSummary) {
  const powerAction = formatRequestPowerAction(request.inventory?.power_action)
  if (powerAction) {
    return powerAction
  }

  if (request.inventory?.snapshot_name) {
    return `${formatRequestKind(request.kind)}: ${request.inventory.snapshot_name}`
  }

  return formatRequestKind(request.kind)
}

export function getRecentActivityTitle(request: ApiRequestSummary) {
  if (request.kind === "inventory.vm.snapshot.rollback") {
    return "Rollback snapshot"
  }

  return getRequestTitle(request)
}

export function getRequestTargetLabel(request: ApiRequestSummary) {
  if (request.inventory?.vmid) {
    return formatVmReference(
      request.inventory.vmid,
      request.inventory.item_name ?? undefined
    )
  }

  return request.inventory?.item_name ?? "Inventory item"
}

export function getRequestSortTime(request: ApiRequestSummary) {
  const value = request.updated_at ?? request.created_at
  if (!value) return 0
  return new Date(value).getTime()
}

export function countAccessibleInventory(nodes: Array<ApiTreeNode>): {
  folders: number
  vms: number
} {
  return nodes.reduce(
    (counts, node) => {
      if (node.kind === "folder") {
        counts.folders += 1
      } else {
        counts.vms += 1
      }

      if (node.children) {
        const childCounts = countAccessibleInventory(node.children)
        counts.folders += childCounts.folders
        counts.vms += childCounts.vms
      }

      return counts
    },
    { folders: 0, vms: 0 }
  )
}

export function indexInventoryTree(nodes: Array<ApiTreeNode>) {
  const items = new Map<string, ApiTreeNode>()

  const visit = (entries: Array<ApiTreeNode>) => {
    for (const entry of entries) {
      items.set(entry.id, entry)
      if (entry.children) {
        visit(entry.children)
      }
    }
  }

  visit(nodes)

  return items
}
