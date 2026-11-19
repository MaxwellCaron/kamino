import type { ApiTreeNode } from "@/lib/inventory/inventory-types"
import { FolderIcon } from "@/components/inventory/folder-icon"
import { VmIcon } from "@/components/vms/vm-icon"

export function InventoryNodeIcon({
  isExpanded,
  node,
  status,
}: {
  isExpanded?: boolean
  node: ApiTreeNode
  status?: string
}) {
  if (node.kind === "folder") {
    return <FolderIcon open={isExpanded} />
  }

  return (
    <VmIcon
      status={status}
      isTemplate={node.vm?.is_template}
      guestType={node.vm?.guest_type}
    />
  )
}
