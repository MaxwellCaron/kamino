import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { useCallback, useMemo, useSyncExternalStore } from "react"
import { AnimatePresence, m } from "motion/react"
import { IconChevronDown, IconFolder, IconStar } from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import { InventoryNodeMenu } from "../inventory-actions"
import { useInventoryTreeContext } from "./inventory-tree"
import { VmIcon } from "./vm-icon"
import type { Variants } from "motion/react"
import type { ApiTreeNode } from "../../types/inventory-types"

const FAVORITES_OPEN_STORAGE_KEY = "kamino-favorite-inventory-open"
const favoritesOpenListeners = new Set<() => void>()

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: "easeIn" },
  },
}

const sectionVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: "easeIn" },
  },
}

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
  onToggle,
  onClick,
}: {
  item: ApiTreeNode
  status?: string
  onToggle: () => void
  onClick: () => void
}) {
  const isFolder = item.kind === "folder"
  const isTemplate = item.vm?.is_template

  return (
    <m.div
      layoutId={`favorite-${item.id}`}
      layout
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        "group/favorite relative flex cursor-pointer items-center gap-2 rounded-3xl px-2 py-1.5",
        "transition-colors hover:bg-muted/50"
      )}
      onClick={onClick}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-3xl bg-muted/50 ring-1 ring-border transition-all group-hover/favorite:ring-muted-foreground/20">
        {isFolder ? (
          <IconFolder className="size-4 fill-yellow-600/20 text-yellow-600 dark:fill-yellow-400/20 dark:text-yellow-400" />
        ) : (
          <VmIcon status={status} isTemplate={isTemplate} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {isFolder ? "Folder" : isTemplate ? "Template" : "Virtual Machine"}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <Button
          size="icon-sm"
          variant="secondary"
          className="opacity-0 transition-opacity group-hover/favorite:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
        >
          <IconStar className="size-4 fill-current" />
        </Button>
        <InventoryNodeMenu
          itemId={item.id}
          data={item}
          className="bg-transparent! opacity-0 transition-opacity group-hover/favorite:opacity-100 data-popup-open:opacity-100"
        />
      </div>
    </m.div>
  )
}

export function InventoryFavoritesSection() {
  const {
    favoriteIds,
    toggleFavorite,
    getStatus,
    getItemData,
    handleFavoritePrimaryAction,
  } = useInventoryTreeContext()
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
        <CollapsibleTrigger className="group/collapsible-trigger flex w-full items-center gap-1 rounded-2xl px-2 py-1 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-muted/50">
          <span>Favorites ({favoriteItems.length})</span>
          <IconChevronDown className="ml-auto size-3.5 transition-transform group-data-panel-open/collapsible-trigger:rotate-180" />
        </CollapsibleTrigger>
        <AnimatePresence initial={false}>
          {favoritesOpen && (
            <CollapsibleContent>
              <m.div
                layout
                variants={sectionVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-col gap-1 px-1 py-2"
              >
                <AnimatePresence mode="popLayout">
                  {favoriteItems.map((item) => (
                    <FavoriteItemCard
                      key={item.id}
                      item={item}
                      status={getStatus(item.id)}
                      onToggle={() => toggleFavorite(item.id)}
                      onClick={() => handleFavoritePrimaryAction(item.id, item)}
                    />
                  ))}
                </AnimatePresence>
              </m.div>
            </CollapsibleContent>
          )}
        </AnimatePresence>
      </div>
    </Collapsible>
  )
}
