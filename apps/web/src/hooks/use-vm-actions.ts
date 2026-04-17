import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  cloneVM,
  convertToTemplate,
  createSnapshot,
  deleteSnapshot,
  deleteVM,
  inventoryTreeQueryOptions,
  renameVM,
  rollbackSnapshot,
  updateVMNotes,
  vmPowerAction,
} from "@/lib/queries"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function useVmPowerAction() {
  return useMutation({
    mutationFn: vmPowerAction,
  })
}

export function useDeleteVM() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: deleteVM,
    onSuccess: () => {
      navigate({ to: "/" })
    },
  })
}

export function useCreateSnapshot(node: string, vmid: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createSnapshot,
    onSuccess: async () => {
      // Wait 7 second to let the backend settle
      await delay(7000)
      queryClient.invalidateQueries({
        queryKey: ["vms", node, vmid, "snapshots"],
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
    },
  })
}

export function useCloneVM() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: cloneVM,
    onSuccess: async () => {
      // Wait 7 second to let the backend settle
      await delay(7000)
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    },
  })
}

export function useConvertToTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: convertToTemplate,
    onSuccess: async () => {
      // Wait 7 second to let the backend settle
      await delay(7000)
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    },
  })
}

export function useRollbackSnapshot(node: string, vmid: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: rollbackSnapshot,
    onSuccess: async () => {
      // Wait 7 second to let the backend settle
      await delay(7000)
      queryClient.invalidateQueries({
        queryKey: ["vms", node, vmid, "snapshots"],
      })
    },
  })
}

export function useDeleteSnapshot(node: string, vmid: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteSnapshot,
    onSuccess: async () => {
      // Wait 7 second to let the backend settle
      await delay(7000)
      queryClient.invalidateQueries({
        queryKey: ["vms", node, vmid, "snapshots"],
      })
    },
  })
}
