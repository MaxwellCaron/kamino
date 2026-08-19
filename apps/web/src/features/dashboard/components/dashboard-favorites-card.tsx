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
      <CardContent className="no-scrollbar min-h-0 flex-1 scroll-fade overflow-y-auto overscroll-contain px-4">
        {treeError ? (
          <InlineErrorAlert
            error={treeError}
            fallback="Failed to load favorites."
          />
        ) : isTreeLoading ? (
          <div
            aria-busy="true"
            aria-label="Loading favorites"
            className="flex flex-col gap-3"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : favorites.length > 0 ? (
          <div>
            <ItemGroup>
              {favorites.map((favorite) => {
                const vmid = favorite.vm?.vmid
                const status =
                  vmid !== undefined ? vmStatuses?.[vmid] : undefined

                return (
                  <div key={favorite.id}>
                    <InventoryFolderItem
                      node={favorite}
                      status={status}
                      isFavorite
                      onToggleFavorite={() => toggleFavorite(favorite.id)}
                    />
                  </div>
                )
              })}
            </ItemGroup>
          </div>
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
