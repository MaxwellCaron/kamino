import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  cloneVM,
  convertToTemplate,
  deleteSnapshot,
  deleteVM,
  inventoryTreeQueryOptions,
  renameVM,
  rollbackSnapshot,
  vmPowerAction,
  vmStatusQueryOptions,
} from "@/lib/queries"

export function useVmPowerAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: vmPowerAction,
    onSuccess: (_data, variables) => {
      toast.success(`VM ${variables.action} initiated`)
      queryClient.invalidateQueries({
        queryKey: vmStatusQueryOptions.queryKey,
      })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteVM() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: deleteVM,
    onSuccess: () => {
      toast.success("VM deleted")
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: vmStatusQueryOptions.queryKey,
      })
      navigate({ to: "/" })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
}

export function useRenameVM() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: renameVM,
    onSuccess: () => {
      toast.success("VM renamed")
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
}

export function useCloneVM() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: cloneVM,
    onSuccess: () => {
      toast.success("Clone initiated")
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
}

export function useConvertToTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: convertToTemplate,
    onSuccess: () => {
      toast.success("Converted to template")
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
}

export function useRollbackSnapshot(node: string, vmid: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: rollbackSnapshot,
    onSuccess: () => {
      toast.success("Snapshot rollback initiated")
      queryClient.invalidateQueries({
        queryKey: ["vms", node, vmid, "snapshots"],
      })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteSnapshot(node: string, vmid: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteSnapshot,
    onSuccess: () => {
      toast.success("Snapshot deleted")
      queryClient.invalidateQueries({
        queryKey: ["vms", node, vmid, "snapshots"],
      })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
}
