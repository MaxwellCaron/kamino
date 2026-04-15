import { useCallback, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import { InventoryTreeContent } from "./tree-content"
import { InventoryTreeSearch } from "./tree-search"
import { useInventoryHeadlessTree } from "./use-inventory-headless-tree"
import { buildVmIdMap, countLeaves, filterTree, flattenApiTree } from "./utils"
import type { ApiTreeNode } from "@/lib/queries"
import { inventoryTreeQueryOptions, vmStatusQueryOptions } from "@/lib/queries"
import { useMoveInventoryItem } from "@/hooks/use-inventory-actions"
import { LoadingTransition } from "@/components/loading-transition"

export function InventoryTree() {
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

  const { items, children, folderIds } = useMemo(
    () => flattenApiTree(filteredApiTree),
    [filteredApiTree]
  )

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

  const tree = useInventoryHeadlessTree({
    activeItemId,
    children,
    items,
    folderIds,
    onMove: handleMove,
    onPrimaryAction: handlePrimaryAction,
  })

  if (error) {
    return (
      <div className="px-4 py-2 text-sm text-destructive">{error.message}</div>
    )
  }

  if (!isLoading && apiTree.length === 0) {
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
      <InventoryTreeSearch
        query={query}
        resultCount={resultCount}
        setQuery={setQuery}
      />
      <InventoryTreeContent tree={tree} getStatus={getStatus} />
    </LoadingTransition>
  )
}
