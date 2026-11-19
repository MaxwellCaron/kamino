import type {
  ApiTreeNode,
  SelectedFolderItem,
  SelectedVmItem,
} from "@/lib/inventory/inventory-types"
import { FolderIcon } from "@/components/inventory/folder-icon"
import type { InventoryDeleteItem } from "@/lib/inventory/actions/inventory-delete-items"
import { VmIcon } from "@/components/vms/vm-icon"
import { formatVmReference } from "@/lib/vms/vm-reference"

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
          guestType={node.vm.guest_type}
        />
      ),
      successDescription: "Deleted",
    })
  }

  for (const folder of folderTargets) visit(folder)
  for (const vm of vmTargets) visit(vm)

  return items
}
