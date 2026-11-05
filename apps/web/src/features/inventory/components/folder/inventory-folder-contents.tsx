import { animateContainer, animateTableRow } from "@/components/animate"
import type { ApiTreeNode } from "../../types/inventory-types"
import { InventoryFolderItem } from "./inventory-folder-item"
import { ItemGroup } from "@workspace/ui/components/item"
import { m } from "motion/react"
import { sortInventoryTree } from "../../utils/inventory-tree"
import { useInventoryFavorites } from "../../hooks/use-inventory-favorites"
import { useQuery } from "@tanstack/react-query"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"

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
