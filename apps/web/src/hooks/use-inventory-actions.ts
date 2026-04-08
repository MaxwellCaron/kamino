import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ApiTreeNode } from "@/lib/queries"
import {
  createFolder,
  inventoryTreeQueryOptions,
  moveInventoryItem,
  renameFolder,
} from "@/lib/queries"
import { sortInventoryTree } from "@/lib/inventory-tree"

function findTreeNode(
  nodes: Array<ApiTreeNode>,
  id: string
): ApiTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findTreeNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

function removeTreeNode(
  nodes: Array<ApiTreeNode>,
  id: string
): [Array<ApiTreeNode>, ApiTreeNode | null] {
  const index = nodes.findIndex((node) => node.id === id)
  if (index !== -1) {
    const removed = nodes[index]
    return [nodes.filter((_, currentIndex) => currentIndex !== index), removed]
  }

  let removed: ApiTreeNode | null = null
  const nextNodes = nodes.map((node) => {
    if (!node.children || removed) return node
    const [nextChildren, found] = removeTreeNode(node.children, id)
    if (!found) return node
    removed = found
    return { ...node, children: nextChildren }
  })

  return [nextNodes, removed]
}

function insertTreeNode(
  nodes: Array<ApiTreeNode>,
  targetId: string,
  nodeToInsert: ApiTreeNode
): Array<ApiTreeNode> {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return {
        ...node,
        children: sortInventoryTree([...(node.children ?? []), nodeToInsert]),
      }
    }
    if (!node.children) return node
    return {
      ...node,
      children: insertTreeNode(node.children, targetId, nodeToInsert),
    }
  })
}

function isDescendant(
  nodes: Array<ApiTreeNode>,
  parentId: string,
  childId: string
): boolean {
  const parent = findTreeNode(nodes, parentId)
  if (!parent?.children) return false

  for (const child of parent.children) {
    if (child.id === childId) return true
    if (child.kind === "folder" && isDescendant([child], child.id, childId)) {
      return true
    }
  }

  return false
}

function moveTreeNode(
  nodes: Array<ApiTreeNode>,
  sourceId: string,
  targetId: string
): Array<ApiTreeNode> {
  if (sourceId === targetId || isDescendant(nodes, sourceId, targetId)) {
    return nodes
  }

  const [treeWithoutSource, removedNode] = removeTreeNode(nodes, sourceId)
  if (!removedNode) return nodes

  return sortInventoryTree(
    insertTreeNode(treeWithoutSource, targetId, removedNode)
  )
}

export function useMoveInventoryItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: moveInventoryItem,
    onMutate: (variables) => {
      const previousTree = queryClient.getQueryData<Array<ApiTreeNode>>(
        inventoryTreeQueryOptions.queryKey
      )

      if (previousTree) {
        queryClient.setQueryData<Array<ApiTreeNode>>(
          inventoryTreeQueryOptions.queryKey,
          moveTreeNode(previousTree, variables.itemId, variables.parentId)
        )
      }

      void queryClient.cancelQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })

      return { previousTree }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTree) {
        queryClient.setQueryData(
          inventoryTreeQueryOptions.queryKey,
          context.previousTree
        )
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    },
  })
}

export function useCreateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createFolder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    },
  })
}

export function useRenameFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: renameFolder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    },
  })
}
