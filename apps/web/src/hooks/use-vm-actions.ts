import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import {
  cloneVM,
  convertToTemplate,
  createSnapshot,
  deleteSnapshot,
  deleteVM,
  inventoryTreeQueryOptions,
  renameVM,
  rollbackSnapshot,
  updateVMHardware,
  updateVMNotes,
  vmHardwareQueryOptions,
  vmPowerAction,
  vmStatusQueryOptions,
} from "@/lib/queries"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
  const navigate = useNavigate()
  const activeItemId = useParams({ strict: false }).itemId

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

      if (activeItemId && result.succeeded.includes(activeItemId)) {
        navigate({ to: "/", replace: true })
      }
    },
  })
}

export function useCreateSnapshot(itemId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createSnapshot,
    onSuccess: async () => {
      // Wait 7 second to let the backend settle
      await delay(7000)
      queryClient.invalidateQueries({
        queryKey: ["inventory", "item", itemId, "vm", "snapshots"],
      })
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
      queryClient.invalidateQueries({ queryKey: ["inventory", "item", itemId] })
    },
  })
}

export function useCloneVM() {
  return useMutation({
    mutationFn: cloneVM,
  })
}

export function useConvertToTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: convertToTemplate,
    onSuccess: async (result) => {
      if (result.succeeded.length === 0) {
        return
      }

      // Wait 7 second to let the backend settle
      await delay(7000)
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
    onSuccess: async () => {
      // Wait 7 second to let the backend settle
      await delay(7000)
      queryClient.invalidateQueries({
        queryKey: ["inventory", "item", itemId, "vm", "snapshots"],
      })
    },
  })
}

export function useDeleteSnapshot(itemId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteSnapshot,
    onSuccess: async () => {
      // Wait 7 second to let the backend settle
      await delay(7000)
      queryClient.invalidateQueries({
        queryKey: ["inventory", "item", itemId, "vm", "snapshots"],
      })
    },
  })
}
