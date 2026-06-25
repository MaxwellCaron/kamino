import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Link } from "@tanstack/react-router"
import { useCallback, useMemo, useSyncExternalStore } from "react"
import { IconChevronDown, IconFolder } from "@tabler/icons-react"
import { InventoryNodeMenu } from "../inventory-actions"
import { useInventoryTreeContext } from "./inventory-tree-context"
import type { ApiTreeNode } from "../../types/inventory-types"
import { VmIcon } from "@/components/status/vm-icon"

const FAVORITES_OPEN_STORAGE_KEY = "kamino-favorite-inventory-open"
const favoritesOpenListeners = new Set<() => void>()

function subscribeToFavoritesOpen(onStoreChange: () => void) {
  favoritesOpenListeners.add(onStoreChange)

  if (typeof window === "undefined") {
    return () => {
      favoritesOpenListeners.delete(onStoreChange)
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_OPEN_STORAGE_KEY) {
      onStoreChange()
    }
  }

  window.addEventListener("storage", handleStorage)

  return () => {
    favoritesOpenListeners.delete(onStoreChange)
    window.removeEventListener("storage", handleStorage)
  }
}

function emitFavoritesOpenChange() {
  for (const listener of favoritesOpenListeners) {
    listener()
  }
}

function readFavoritesOpenSnapshot() {
  if (typeof window === "undefined") return "true"
  return localStorage.getItem(FAVORITES_OPEN_STORAGE_KEY) ?? "true"
}

function parseFavoritesOpen(snapshot: string) {
  return snapshot !== "false"
}

function writeFavoritesOpen(open: boolean) {
  if (typeof window === "undefined") return
  localStorage.setItem(FAVORITES_OPEN_STORAGE_KEY, String(open))
  emitFavoritesOpenChange()
}

function useFavoritesSectionState() {
  const snapshot = useSyncExternalStore(
    subscribeToFavoritesOpen,
    readFavoritesOpenSnapshot,
    () => "true"
  )

  const favoritesOpen = parseFavoritesOpen(snapshot)

  const setFavoritesOpen = useCallback((open: boolean) => {
    writeFavoritesOpen(open)
  }, [])

  return { favoritesOpen, setFavoritesOpen }
}

function FavoriteItemCard({
  item,
  status,
}: {
  item: ApiTreeNode
  status?: string
}) {
  const isFolder = item.kind === "folder"
  const isTemplate = item.vm?.is_template

  return (
    <Item
      variant="muted"
      className="py-2"
      render={
        <Link to="/inventory/items/$itemId" params={{ itemId: item.id }}>
          <ItemMedia variant="icon">
            {isFolder ? (
              <IconFolder className="fill-amber-600/20 text-amber-600 dark:fill-amber-400/20 dark:text-amber-400" />
            ) : (
              <VmIcon status={status} isTemplate={isTemplate} />
            )}
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
  const { favoriteIds, getStatus, getItemData } = useInventoryTreeContext()
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
        <CollapsibleTrigger className="group/collapsible-trigger flex w-full items-center gap-1 rounded-2xl px-3 py-1 text-xs text-sidebar-foreground/70 transition-colors hover:bg-muted/50">
          <span>Favorites ({favoriteItems.length})</span>
          <IconChevronDown className="ml-auto size-3.5 transition-transform group-data-panel-open/collapsible-trigger:rotate-180" />
        </CollapsibleTrigger>
        {favoritesOpen && (
          <CollapsibleContent>
            <ItemGroup className="flex flex-col gap-1.5 px-1 py-2">
              {favoriteItems.map((item) => (
                <FavoriteItemCard
                  key={item.id}
                  item={item}
                  status={getStatus(item.id)}
                />
              ))}
            </ItemGroup>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  )
}
