import type {
  ApiTreeNode,
  SelectedFolderItem,
  SelectedVmItem,
} from "../types/inventory-types"
import type { ReactNode } from "react"
import { FolderIcon } from "@/components/status/folder-icon"
import { VmIcon } from "@/components/status/vm-icon"
import { formatVmReference } from "@/features/shared/utils/format"

export type InventoryDeleteItem = {
  id: string
  name: string
  icon: ReactNode
  successDescription?: string
}

export function collectInventoryDeleteItemIds(node: ApiTreeNode) {
  const ids: Array<string> = []

  function visit(item: ApiTreeNode) {
    ids.push(item.id)
    for (const child of item.children ?? []) visit(child)
  }

  visit(node)
  return ids
}

export function createInventoryDeleteItems({
  folderTargets,
  vmTargets,
  getVmStatus,
}: {
  folderTargets: Array<SelectedFolderItem>
  vmTargets: Array<SelectedVmItem>
  getVmStatus: (itemId: string) => string | undefined
}): Array<InventoryDeleteItem> {
  const items: Array<InventoryDeleteItem> = []

  function visit(node: ApiTreeNode) {
    if (node.kind === "folder") {
      items.push({
        id: node.id,
        name: node.name,
        icon: <FolderIcon />,
        successDescription: "Deleted",
      })

      for (const child of node.children ?? []) visit(child)
      return
    }

    if (!node.vm) return

    items.push({
      id: node.id,
      name: formatVmReference(node.vm.vmid, node.name),
      icon: (
        <VmIcon
          status={getVmStatus(node.id)}
          isTemplate={node.vm.is_template}
        />
      ),
      successDescription: "Deleted",
    })
  }

  for (const folder of folderTargets) visit(folder)
  for (const vm of vmTargets) visit(vm)

  return items
}
