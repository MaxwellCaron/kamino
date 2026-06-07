import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  createFolder,
  deleteFolder,
  inventoryAclQueryOptions,
  inventoryTreeQueryOptions,
  moveInventoryItems,
  renameFolder,
  updateFolderVmLimit,
  updateInventoryAcl,
} from "../api/inventory-api"
import { moveInventoryTreeNodes } from "../utils/inventory-tree"
import type { ApiTreeNode } from "../types/inventory-types"

function useInvalidateInventoryTreeMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<void>
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    },
  })
}

export function useMoveInventoryItems() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: moveInventoryItems,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })

      const previousTree = queryClient.getQueryData<Array<ApiTreeNode>>(
        inventoryTreeQueryOptions.queryKey
      )

      if (previousTree) {
        queryClient.setQueryData<Array<ApiTreeNode>>(
          inventoryTreeQueryOptions.queryKey,
          moveInventoryTreeNodes(
            previousTree,
            variables.itemIds,
            variables.parentId
          )
        )
      }

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
      if (
        queryClient.getQueryState(inventoryTreeQueryOptions.queryKey)
          ?.fetchStatus === "fetching"
      ) {
        return
      }

      await queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    },
  })
}

export function useCreateFolder() {
  return useInvalidateInventoryTreeMutation(createFolder)
}

export function useRenameFolder() {
  return useInvalidateInventoryTreeMutation(renameFolder)
}

export function useUpdateFolderVmLimit() {
  return useInvalidateInventoryTreeMutation(updateFolderVmLimit)
}

export function useDeleteFolder() {
  return useInvalidateInventoryTreeMutation(deleteFolder)
}

export function useUpdateInventoryAcl() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateInventoryAcl,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: inventoryTreeQueryOptions.queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryAclQueryOptions(variables.itemId).queryKey,
        }),
      ])
    },
  })
}
