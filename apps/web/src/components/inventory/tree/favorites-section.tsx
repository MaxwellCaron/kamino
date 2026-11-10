import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons"
import { animateContainer, animateTableRow } from "@/lib/motion/animate"
import {
  useInventoryTreeDataContext,
  useInventoryTreeViewContext,
} from "@/hooks/inventory/tree/use-inventory-tree-context"
import type { ApiTreeNode } from "../../../lib/inventory/inventory-types"
import { HugeiconsIcon } from "@hugeicons/react"
import { InventoryNodeIcon } from "@/components/inventory/inventory-node-icon"
import { InventoryNodeMenu } from "@/components/inventory/actions/inventory-node-menu"
import { Link } from "@tanstack/react-router"
import { buttonVariants } from "@workspace/ui/components/button"
import { m } from "motion/react"
import { useFavoritesSectionState } from "@/hooks/inventory/tree/use-favorites-section-state"
import { useMemo } from "react"

function FavoriteItemCard({
  item,
  status,
}: {
  item: ApiTreeNode
  status?: string
}) {
  return (
    <Item
      variant="muted"
      className="py-2"
      render={
        <Link to="/inventory/items/$itemId" params={{ itemId: item.id }}>
          <ItemMedia variant="icon">
            <InventoryNodeIcon node={item} status={status} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{item.name}</ItemTitle>
          </ItemContent>
          <ItemActions
            onClickCapture={(event) => {
              if (event.currentTarget.contains(event.target as Node)) {
                event.preventDefault()
              }
            }}
          >
            <InventoryNodeMenu itemId={item.id} data={item} />
          </ItemActions>
        </Link>
      }
    />
  )
}

export function InventoryFavoritesSection() {
  const { favoriteIds } = useInventoryTreeViewContext()
  const { getStatus, getItemData } = useInventoryTreeDataContext()
  const { favoritesOpen, setFavoritesOpen } = useFavoritesSectionState()

  const favoriteItems = useMemo(() => {
    const result: Array<ApiTreeNode> = []
    for (const id of favoriteIds) {
      const item = getItemData(id)
      if (item) {
        result.push(item)
      }
    }
    return result
  }, [favoriteIds, getItemData])

  return (
    <Collapsible open={favoritesOpen} onOpenChange={setFavoritesOpen}>
      <div className="flex flex-col">
        <div className="flex items-center justify-between pl-3 text-xs text-muted-foreground">
          <span>Favorites ({favoriteItems.length})</span>
          <CollapsibleTrigger
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            {favoritesOpen ? (
              <HugeiconsIcon icon={ViewOffSlashIcon} className="size-3.5" />
            ) : (
              <HugeiconsIcon icon={ViewIcon} className="size-3.5" />
            )}
          </CollapsibleTrigger>
        </div>

        {favoritesOpen && favoriteItems.length > 0 && (
          <CollapsibleContent>
            <m.div
              className="flex flex-col gap-1.5 py-3 pl-1"
              initial="hidden"
              animate="show"
              variants={animateContainer}
            >
              {favoriteItems.map((item) => (
                <m.div key={item.id} variants={animateTableRow}>
                  <FavoriteItemCard
                    key={item.id}
                    item={item}
                    status={getStatus(item.id)}
                  />
                </m.div>
              ))}
            </m.div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  )
}
