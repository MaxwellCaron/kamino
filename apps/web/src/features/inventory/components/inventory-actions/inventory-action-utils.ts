import type { ApiBulkVmMutationResponse } from "@/features/vms/types/vm-types"

export function assertSingleItemMutationSucceeded(
  result: ApiBulkVmMutationResponse,
  fallback: string
) {
  if (result.failed.length > 0 || result.succeeded.length === 0) {
    throw new Error(result.failed[0]?.error ?? fallback)
  }

  return result
}

export function stopTreeItemEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

export function hasFavoriteAction(onToggleFavorite?: () => void) {
  return typeof onToggleFavorite === "function"
}
