import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { useCallback, useMemo, useSyncExternalStore } from "react"
import { AnimatePresence, motion } from "motion/react"
import { IconChevronDown, IconFolder, IconStar } from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import { InventoryNodeMenu } from "../inventory-actions"
import { useInventoryTreeContext } from "./inventory-tree"
import { VmIcon } from "./vm-icon"
import type { Variants } from "motion/react"
import type { ApiTreeNode } from "@/lib/queries"

const FAVORITES_COLLAPSED_STORAGE_KEY = "kamino-favorite-inventory-collapsed"
const favoritesCollapsedListeners = new Set<() => void>()

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

function subscribeToFavoritesCollapsed(onStoreChange: () => void) {
  favoritesCollapsedListeners.add(onStoreChange)

  if (typeof window === "undefined") {
    return () => {
      favoritesCollapsedListeners.delete(onStoreChange)
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_COLLAPSED_STORAGE_KEY) {
      onStoreChange()
    }
  }

  window.addEventListener("storage", handleStorage)

  return () => {
    favoritesCollapsedListeners.delete(onStoreChange)
    window.removeEventListener("storage", handleStorage)
  }
}

function emitFavoritesCollapsedChange() {
  for (const listener of favoritesCollapsedListeners) {
    listener()
  }
}

function readFavoritesCollapsedSnapshot() {
  if (typeof window === "undefined") return "false"
  return localStorage.getItem(FAVORITES_COLLAPSED_STORAGE_KEY) ?? "false"
}

function parseFavoritesCollapsed(snapshot: string) {
  return snapshot === "true"
}

function writeFavoritesCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") return
  localStorage.setItem(FAVORITES_COLLAPSED_STORAGE_KEY, String(collapsed))
  emitFavoritesCollapsedChange()
}

function useFavoritesSectionState() {
  const snapshot = useSyncExternalStore(
    subscribeToFavoritesCollapsed,
    readFavoritesCollapsedSnapshot,
    () => "false"
  )

  const favoritesCollapsed = parseFavoritesCollapsed(snapshot)

  const setFavoritesCollapsed = useCallback((collapsed: boolean) => {
    writeFavoritesCollapsed(collapsed)
  }, [])

  return { favoritesCollapsed, setFavoritesCollapsed }
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
    <motion.div
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
    </motion.div>
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
  const { favoritesCollapsed, setFavoritesCollapsed } =
    useFavoritesSectionState()

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
    <Collapsible
      open={!favoritesCollapsed}
      onOpenChange={(open) => setFavoritesCollapsed(!open)}
    >
      <div className="flex flex-col">
        <CollapsibleTrigger className="group/collapsible-trigger flex w-full items-center gap-1 rounded-2xl px-2 py-1 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-muted/50">
          <span>Favorites ({favoriteItems.length})</span>
          <IconChevronDown className="ml-auto size-3.5 transition-transform group-data-panel-open/collapsible-trigger:rotate-180" />
        </CollapsibleTrigger>
        <AnimatePresence initial={false}>
          {!favoritesCollapsed && (
            <CollapsibleContent>
              <motion.div
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
              </motion.div>
            </CollapsibleContent>
          )}
        </AnimatePresence>
      </div>
    </Collapsible>
  )
}
