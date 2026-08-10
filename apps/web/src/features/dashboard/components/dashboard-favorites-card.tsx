import { m } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { StarIcon } from "@hugeicons/core-free-icons"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { ItemGroup } from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import { InventoryFolderItem } from "@/features/inventory/components/folder/inventory-folder-item"
import { useInventoryFavorites } from "@/features/inventory/hooks/use-inventory-favorites"
import { animateContainer, animateTableRow } from "@/components/animate"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"

export function DashboardFavoritesCard({
  className,
  favorites,
  isTreeLoading = false,
  treeError,
  vmStatuses,
}: {
  className?: string
  favorites: Array<ApiTreeNode>
  isTreeLoading?: boolean
  treeError?: unknown
  vmStatuses?: Record<number, string>
}) {
  const { toggleFavorite } = useInventoryFavorites()
  const visibleFavorites = favorites.slice(0, 5)

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Favorites
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Favorited items in the inventory tree.
        </CardDescription>
      </CardHeader>
      <CardContent className="h-full">
        {treeError ? (
          <InlineErrorAlert
            error={treeError}
            fallback="Failed to load favorites."
          />
        ) : isTreeLoading ? (
          <div aria-busy="true" aria-label="Loading favorites" className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : visibleFavorites.length > 0 ? (
          <m.div initial="hidden" animate="show" variants={animateContainer}>
            <ItemGroup>
              {visibleFavorites.map((favorite) => {
                const vmid = favorite.vm?.vmid
                const status =
                  vmid !== undefined ? vmStatuses?.[vmid] : undefined

                return (
                  <m.div key={favorite.id} variants={animateTableRow}>
                    <InventoryFolderItem
                      key={favorite.id}
                      node={favorite}
                      status={status}
                      isFavorite
                      onToggleFavorite={() => toggleFavorite(favorite.id)}
                    />
                  </m.div>
                )
              })}
            </ItemGroup>
          </m.div>
        ) : (
          <Empty className="h-full min-h-52 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon
                  icon={StarIcon}
                  className="text-muted-foreground"
                />
              </EmptyMedia>
              <EmptyTitle>No favorites yet</EmptyTitle>
              <EmptyDescription>
                Add items to favorites from the inventory tree to pin them here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
