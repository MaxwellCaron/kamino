import { animateContainer, animateTableRow } from "@/lib/motion/animate"
import type { ApiTreeNode } from "@/lib/inventory/inventory-types"
import { InventoryFolderItem } from "@/components/inventory/inventory-folder-item"
import { ItemGroup } from "@workspace/ui/components/item"
import { m } from "motion/react"
import { sortInventoryTree } from "@/lib/inventory/inventory-tree"
import { useInventoryFavorites } from "@/hooks/inventory/use-inventory-favorites"
import { useQuery } from "@tanstack/react-query"
import { vmStatusQueryOptions } from "@/lib/vms/vm-api"

export function InventoryFolderContents({ folder }: { folder: ApiTreeNode }) {
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const { favoriteIds, toggleFavorite } = useInventoryFavorites()
  const children = sortInventoryTree(folder.children ?? [])

  if (children.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing here yet.</p>
  }

  return (
    <m.div
      key={folder.id}
      initial="hidden"
      animate="show"
      variants={animateContainer}
    >
      <ItemGroup>
        {children.map((child) => (
          <m.div key={child.id} variants={animateTableRow}>
            <InventoryFolderItem
              key={child.id}
              node={child}
              status={
                child.kind === "vm" && child.vm
                  ? vmStatuses?.[child.vm.vmid]
                  : undefined
              }
              isFavorite={favoriteIds.has(child.id)}
              onToggleFavorite={() => toggleFavorite(child.id)}
            />
          </m.div>
        ))}
      </ItemGroup>
    </m.div>
  )
}
