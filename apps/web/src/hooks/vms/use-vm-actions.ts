import {
  cloneVM,
  convertToTemplate,
  createSnapshot,
  deleteSnapshot,
  deleteVM,
  migrateVMs,
  renameVM,
  rollbackSnapshot,
  snapshotsQueryOptions,
  submitInventoryPowerRequest,
  submitInventorySnapshotCreateRequest,
  submitInventorySnapshotRollbackRequest,
  updateVMHardware,
  updateVMNotes,
  vmHardwareQueryOptions,
  vmOverviewQueryOptions,
  vmPowerAction,
  vmStatusQueryOptions,
} from "../../lib/vms/vm-api"
import {
  inventoryTreeQueryOptions,
  seedInventoryItemCache,
} from "@/lib/inventory/inventory-api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

export function useVmPowerAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: vmPowerAction,
    onSuccess: (result) => {
      if (result.succeeded.length === 0) {
        return
      }

      queryClient.invalidateQueries({
        queryKey: vmStatusQueryOptions.queryKey,
      })
    },
  })
}

export function useDeleteVM() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteVM,
    onSuccess: (result) => {
      if (result.succeeded.length === 0) {
        return
      }

      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: vmStatusQueryOptions.queryKey,
      })
      queryClient.invalidateQueries({ queryKey: ["inventory", "item"] })
    },
  })
}

export function useMigrateVMs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: migrateVMs,
    onSuccess: (result) => {
      if (result.succeeded.length === 0) {
        return
      }

      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      queryClient.invalidateQueries({ queryKey: ["inventory", "item"] })
    },
  })
}

export function useSubmitInventoryPowerRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: submitInventoryPowerRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] })
    },
  })
}

export function useCreateSnapshot(itemId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createSnapshot,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: snapshotsQueryOptions(itemId).queryKey,
      })
    },
  })
}

export function useSubmitInventorySnapshotCreateRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: submitInventorySnapshotCreateRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] })
    },
  })
}

export function useRenameVM() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: renameVM,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      queryClient.invalidateQueries({ queryKey: ["inventory", "item"] })
    },
  })
}

export function useUpdateVMNotes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateVMNotes,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      queryClient.invalidateQueries({ queryKey: ["inventory", "item"] })
    },
  })
}

export function useUpdateVMHardware(itemId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateVMHardware,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: vmHardwareQueryOptions(itemId).queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: vmOverviewQueryOptions(itemId).queryKey,
      })
      queryClient.invalidateQueries({ queryKey: ["inventory", "item", itemId] })
    },
  })
}

export function useCloneVM() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: cloneVM,
    onSuccess: (result) => {
      seedInventoryItemCache(queryClient, result.item_id, result.item)
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      navigate({
        to: "/inventory/items/$itemId",
        params: { itemId: result.item_id },
      })
    },
  })
}

export function useConvertToTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: convertToTemplate,
    onSuccess: (result) => {
      if (result.succeeded.length === 0) {
        return
      }

      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      queryClient.invalidateQueries({ queryKey: ["inventory", "item"] })
    },
  })
}

export function useRollbackSnapshot(itemId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: rollbackSnapshot,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: snapshotsQueryOptions(itemId).queryKey,
      })
    },
  })
}

export function useSubmitInventorySnapshotRollbackRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: submitInventorySnapshotRollbackRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] })
    },
  })
}

export function useDeleteSnapshot(itemId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteSnapshot,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: snapshotsQueryOptions(itemId).queryKey,
      })
    },
  })
}
