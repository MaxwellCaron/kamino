import { createContext, use, useCallback, useMemo, useState } from "react"
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
import { InventoryTreeContent } from "./tree-content"
import { InventoryTreeSearch } from "./tree-search"
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
}

const InventoryTreeContext = createContext<InventoryTreeContextValue | null>(
  null
)

function useInventoryTreeContext() {
  const ctx = use(InventoryTreeContext)
  if (!ctx) {
    throw new Error(
      "useInventoryTreeContext must be used within an InventoryTreeProvider"
    )
  }
  return ctx
}

export function InventoryTreeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const activeItemId = useParams({ strict: false }).itemId
  const [query, setQuery] = useState("")

  const {
    data: apiTree = [],
    isLoading,
    error,
  } = useQuery(inventoryTreeQueryOptions)
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  const moveItem = useMoveInventoryItem()

  const filteredApiTree = useMemo(
    () => (query ? filterTree(apiTree, query) : apiTree),
    [apiTree, query]
  )
  const resultCount = query ? countLeaves(filteredApiTree) : null

  const {
    items,
    children: treeChildren,
    folderIds,
  } = useMemo(() => flattenApiTree(filteredApiTree), [filteredApiTree])

  const vmIdMap = useMemo(() => buildVmIdMap(items), [items])

  const getStatus = useCallback(
    (itemId: string): string | undefined => {
      if (!vmStatuses) return undefined
      const vmid = vmIdMap.get(itemId)
      if (vmid === undefined) return undefined
      return vmStatuses[vmid]
    },
    [vmStatuses, vmIdMap]
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
      navigate({ to: "/vm/$itemId", params: { itemId } })
    },
    [navigate]
  )

  const { tree, expandAll, collapseAll } = useInventoryHeadlessTree({
    activeItemId,
    children: treeChildren,
    items,
    folderIds,
    onMove: handleMove,
    onPrimaryAction: handlePrimaryAction,
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
  }

  return <InventoryTreeContext value={value}>{children}</InventoryTreeContext>
}

export function InventoryTreeHeader() {
  const { query, setQuery, resultCount, expandAll, collapseAll, isLoading } =
    useInventoryTreeContext()

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
      <InventoryTreeContent tree={tree} getStatus={getStatus} />
    </LoadingTransition>
  )
}
