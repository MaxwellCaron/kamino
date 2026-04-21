import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { SidebarGroupLabel } from "@workspace/ui/components/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { AnimatePresence } from "motion/react"
import { InventoryTreeContent } from "./tree-content"
import { InventoryTreeSearch } from "./tree-search"
import { InventoryFavoritesSection } from "./favorites-section"
import { useInventoryHeadlessTree } from "./use-inventory-headless-tree"
import { buildVmIdMap, countLeaves, filterTree, flattenApiTree } from "./utils"
import type { ReactNode } from "react"
import type { TreeInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "@/lib/queries"
import { inventoryTreeQueryOptions, vmStatusQueryOptions } from "@/lib/queries"
import { useMoveInventoryItem } from "@/hooks/use-inventory-actions"
import { LoadingTransition } from "@/components/loading-transition"

interface InventoryTreeContextValue {
  query: string
  setQuery: (query: string) => void
  resultCount: number | null
  tree: TreeInstance<ApiTreeNode>
  expandAll: () => void
  collapseAll: () => void
  getStatus: (itemId: string) => string | undefined
  isLoading: boolean
  error: Error | null
  isEmpty: boolean
  favoriteIds: Set<string>
  toggleFavorite: (itemId: string) => void
  getItemData: (itemId: string) => ApiTreeNode | undefined
  handlePrimaryAction: (itemId: string, data: ApiTreeNode) => void
  handleFavoritePrimaryAction: (itemId: string, data: ApiTreeNode) => void
}

interface PendingRevealRequest {
  itemId: string
  requestId: number
}

const InventoryTreeContext = createContext<InventoryTreeContextValue | null>(
  null
)

export function useInventoryTreeContext() {
  const ctx = use(InventoryTreeContext)
  if (!ctx) {
    throw new Error(
      "useInventoryTreeContext must be used within an InventoryTreeProvider"
    )
  }
  return ctx
}

const FAVORITES_STORAGE_KEY = "kamino-favorite-inventory"

const favoriteListeners = new Set<() => void>()

function subscribeToFavorites(onStoreChange: () => void) {
  favoriteListeners.add(onStoreChange)

  if (typeof window === "undefined") {
    return () => {
      favoriteListeners.delete(onStoreChange)
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_STORAGE_KEY) {
      onStoreChange()
    }
  }

  window.addEventListener("storage", handleStorage)

  return () => {
    favoriteListeners.delete(onStoreChange)
    window.removeEventListener("storage", handleStorage)
  }
}

function emitFavoritesChange() {
  for (const listener of favoriteListeners) {
    listener()
  }
}

function readFavoritesSnapshot() {
  if (typeof window === "undefined") return "[]"
  return localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]"
}

function parseFavoriteIds(snapshot: string) {
  try {
    const parsed = JSON.parse(snapshot)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeFavoriteIds(next: Set<string>) {
  if (typeof window === "undefined") return
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(next)))
  emitFavoritesChange()
}

export function useInventoryFavorites() {
  const snapshot = useSyncExternalStore(
    subscribeToFavorites,
    readFavoritesSnapshot,
    () => "[]"
  )

  const favoriteIds = useMemo(
    () => new Set(parseFavoriteIds(snapshot)),
    [snapshot]
  )

  const toggleFavorite = useCallback(
    (itemId: string, options?: { disabled?: boolean }) => {
      if (options?.disabled) return

      const next = new Set(parseFavoriteIds(readFavoritesSnapshot()))
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      writeFavoriteIds(next)
    },
    []
  )

  return { favoriteIds, toggleFavorite }
}

export function InventoryTreeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const activeItemId = useParams({ strict: false }).itemId
  const [query, setQuery] = useState("")
  const [pendingRevealRequest, setPendingRevealRequest] =
    useState<PendingRevealRequest | null>(null)
  const { favoriteIds, toggleFavorite: toggleSharedFavorite } =
    useInventoryFavorites()

  const {
    data: apiTree = [],
    isLoading,
    error,
  } = useQuery(inventoryTreeQueryOptions)
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const moveItem = useMoveInventoryItem()
  const searchQuery = query.trim()
  const isSearchActive = searchQuery.length >= 2

  const filteredApiTree = useMemo(
    () => (isSearchActive ? filterTree(apiTree, searchQuery) : apiTree),
    [apiTree, isSearchActive, searchQuery]
  )
  const resultCount = isSearchActive ? countLeaves(filteredApiTree) : null

  const fullTree = useMemo(() => flattenApiTree(apiTree), [apiTree])

  const {
    items,
    children: treeChildren,
    folderIds,
    parentIds,
  } = useMemo(
    () => (isSearchActive ? flattenApiTree(filteredApiTree) : fullTree),
    [filteredApiTree, fullTree, isSearchActive]
  )

  const toggleFavorite = useCallback(
    (itemId: string) => {
      const item = fullTree.items.get(itemId)
      toggleSharedFavorite(itemId, { disabled: item?.kind === "folder" })
    },
    [fullTree.items, toggleSharedFavorite]
  )

  const vmIdMap = useMemo(() => buildVmIdMap(fullTree.items), [fullTree.items])

  const getStatus = useCallback(
    (itemId: string): string | undefined => {
      if (!vmStatuses) return undefined
      const vmid = vmIdMap.get(itemId)
      if (vmid === undefined) return undefined
      return vmStatuses[vmid]
    },
    [vmStatuses, vmIdMap]
  )

  const getItemData = useCallback(
    (itemId: string) => fullTree.items.get(itemId),
    [fullTree.items]
  )

  const handleMove = useCallback(
    (itemId: string, parentId: string) => {
      moveItem.mutate(
        { itemId, parentId },
        {
          onError: (moveError) => {
            toast.error(
              moveError instanceof Error ? moveError.message : "Move failed"
            )
          },
        }
      )
    },
    [moveItem]
  )

  const handlePrimaryAction = useCallback(
    (itemId: string, data: ApiTreeNode) => {
      if (data.kind !== "vm") return
      navigate({ to: "/inventory/items/$itemId", params: { itemId } })
    },
    [navigate]
  )

  const handleFavoritePrimaryAction = useCallback(
    (itemId: string, data: ApiTreeNode) => {
      setQuery("")
      setPendingRevealRequest((current) => ({
        itemId,
        requestId: current ? current.requestId + 1 : 1,
      }))
      handlePrimaryAction(itemId, data)
    },
    [handlePrimaryAction]
  )

  const handleRevealComplete = useCallback((requestId: number) => {
    setPendingRevealRequest((current) =>
      current?.requestId === requestId ? null : current
    )
  }, [])

  const { tree, expandAll, collapseAll } = useInventoryHeadlessTree({
    activeItemId,
    children: treeChildren,
    items,
    folderIds,
    parentIds,
    onMove: handleMove,
    onPrimaryAction: handlePrimaryAction,
    pendingRevealRequest,
    onRevealComplete: handleRevealComplete,
  })

  const value: InventoryTreeContextValue = {
    query,
    setQuery,
    resultCount,
    tree,
    expandAll,
    collapseAll,
    getStatus,
    isLoading,
    error: error,
    isEmpty: !isLoading && apiTree.length === 0,
    favoriteIds,
    toggleFavorite,
    getItemData,
    handlePrimaryAction,
    handleFavoritePrimaryAction,
  }

  return <InventoryTreeContext value={value}>{children}</InventoryTreeContext>
}

export function InventoryTreeHeader() {
  const {
    query,
    setQuery,
    resultCount,
    expandAll,
    collapseAll,
    isLoading,
    favoriteIds,
  } = useInventoryTreeContext()

  return (
    <>
      <SidebarGroupLabel>Inventory</SidebarGroupLabel>
      <div className="absolute top-3 right-3 flex">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={expandAll}
                disabled={isLoading}
              >
                <IconChevronDown />
              </Button>
            }
          />
          <TooltipContent>
            <p>Expand all</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={collapseAll}
                disabled={isLoading}
              >
                <IconChevronUp />
              </Button>
            }
          />
          <TooltipContent>
            <p>Collapse all</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <InventoryTreeSearch
        query={query}
        resultCount={resultCount}
        setQuery={setQuery}
      />
      <AnimatePresence initial={false}>
        {favoriteIds.size > 0 && <InventoryFavoritesSection />}
      </AnimatePresence>
    </>
  )
}

export function InventoryTreeBody() {
  const { tree, getStatus, isLoading, error, isEmpty } =
    useInventoryTreeContext()

  if (error) {
    return (
      <div className="px-4 py-2 text-sm text-destructive">{error.message}</div>
    )
  }

  if (isEmpty) {
    return (
      <div className="px-4 py-2 text-sm text-muted-foreground">
        No inventory items
      </div>
    )
  }

  return (
    <LoadingTransition
      isLoading={isLoading}
      fallback={
        <div className="px-4 py-2 text-sm text-muted-foreground">
          Loading...
        </div>
      }
    >
      <div className="flex flex-col gap-1">
        <p className="px-2 pt-2 pb-1 text-xs font-medium text-sidebar-foreground/70">
          All Items
        </p>
        <InventoryTreeContent tree={tree} getStatus={getStatus} />
      </div>
    </LoadingTransition>
  )
}
