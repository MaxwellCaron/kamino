import { useCallback } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import {
  deleteUser,
  disableUser,
  enableUser,
  triggerPrincipalSync,
} from "@/features/principals/api/principals-api"
import { formatPrincipalReference } from "@/components/principals/principal-label"
import {
  showSingleMutationToast,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"

export function useUsersPageMutations() {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["principals", "users"] })
    },
  })
  const enableMutation = useMutation({
    mutationFn: enableUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["principals", "users"] })
    },
  })
  const disableMutation = useMutation({
    mutationFn: disableUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["principals", "users"] })
    },
  })

  const syncMutation = useMutation({
    mutationFn: triggerPrincipalSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["principals"] })
    },
  })

  const showSyncToast = useCallback(() => {
    showSingleMutationToast({
      title: "Syncing",
      name: "Principals",
      promise: () => syncMutation.mutateAsync(),
      successDescription: "Synced",
    })
  }, [syncMutation])

  const showDeleteToast = useCallback(
    (targets: Array<ApiPrincipal>, onAllSucceeded?: () => void) => {
      showUnitMutationToast({
        title: "Deleting",
        units: targets.map((target) => ({
          items: [
            {
              id: target.id,
              name: formatPrincipalReference(target),
              successDescription: "Deleted",
            },
          ],
          run: async () => {
            const result = await deleteMutation.mutateAsync([target.id])
            return { failed: result.failed }
          },
        })),
        onSettled: (result) => {
          if (result.failed.length === 0) onAllSucceeded?.()
        },
      })
    },
    [deleteMutation]
  )

  const showEnabledToast = useCallback(
    (
      targets: Array<ApiPrincipal>,
      mode: "enable" | "disable",
      onAllSucceeded?: () => void
    ) => {
      showUnitMutationToast({
        title: mode === "enable" ? "Enabling" : "Disabling",
        units: targets.map((target) => ({
          items: [
            {
              id: target.id,
              name: formatPrincipalReference(target),
              successDescription: mode === "enable" ? "Enabled" : "Disabled",
            },
          ],
          run: async () => {
            if (mode === "enable") {
              if (target.status === false) {
                await enableMutation.mutateAsync(target.id)
              }
            } else if (target.status !== false) {
              await disableMutation.mutateAsync(target.id)
            }
            return { failed: [] }
          },
        })),
        onSettled: (result) => {
          if (result.failed.length === 0) onAllSucceeded?.()
        },
      })
    },
    [disableMutation, enableMutation]
  )

  return {
    syncMutation,
    showSyncToast,
    showDeleteToast,
    showEnabledToast,
  }
}
