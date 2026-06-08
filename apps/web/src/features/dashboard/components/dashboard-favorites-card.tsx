import { Link } from "@tanstack/react-router"
import { IconArrowUpRight, IconStar } from "@tabler/icons-react"
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import { VmIcon } from "@/features/inventory/components/tree/vm-icon"

export function DashboardFavoritesCard({
  className,
  favorites,
  vmStatuses,
}: {
  className?: string
  favorites: Array<ApiTreeNode>
  vmStatuses?: Record<number, string>
}) {
  const visibleFavorites = favorites.slice(0, 5)

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Favorites
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          VMs pinned from the inventory tree.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {visibleFavorites.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {visibleFavorites.map((favorite) => {
              const vmid = favorite.vm?.vmid
              const status = vmid !== undefined ? vmStatuses?.[vmid] : undefined

              return (
                <Item
                  key={favorite.id}
                  variant="muted"
                  size="sm"
                  render={
                    <Link
                      to="/inventory/items/$itemId"
                      params={{ itemId: favorite.id }}
                    >
                      <ItemMedia>
                        <VmIcon
                          status={status}
                          isTemplate={favorite.vm?.is_template}
                        />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{favorite.name}</ItemTitle>
                        <ItemDescription>
                          {favorite.vm?.is_template
                            ? "Template"
                            : (status ?? "VM")}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <IconArrowUpRight className="size-4" />
                      </ItemActions>
                    </Link>
                  }
                />
              )
            })}
          </div>
        ) : (
          <Empty className="min-h-52 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconStar />
              </EmptyMedia>
              <EmptyTitle>No favorites yet</EmptyTitle>
              <EmptyDescription>
                Add VMs to favorites from the inventory tree to pin them here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
