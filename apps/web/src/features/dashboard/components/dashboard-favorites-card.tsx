import { IconStar } from "@tabler/icons-react"
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
import { cn } from "@workspace/ui/lib/utils"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import { VmListItem } from "@/features/vms/components/vm-list-item"

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
      <CardContent className="h-full">
        {visibleFavorites.length > 0 ? (
          <ItemGroup className="grid grid-cols-1 gap-3">
            {visibleFavorites.map((favorite) => {
              const vmid = favorite.vm?.vmid
              const status = vmid !== undefined ? vmStatuses?.[vmid] : undefined

              return (
                <VmListItem
                  key={favorite.id}
                  isTemplate={favorite.vm?.is_template}
                  itemId={favorite.id}
                  name={favorite.name}
                  status={status}
                />
              )
            })}
          </ItemGroup>
        ) : (
          <Empty className="h-full min-h-52 border border-dashed">
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
