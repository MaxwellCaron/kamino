import {
  VM_RESOURCE_POLL_INTERVAL_MS,
  vmResourcesQueryOptions,
} from "@/features/vms/api/vm-api"
import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { VmResources } from "@/features/vms/types/vm-types"

export function useVmDashboardResources({
  itemId,
  enabled,
  overviewSettled,
  initialResources,
}: {
  itemId: string
  enabled: boolean
  overviewSettled: boolean
  initialResources?: VmResources
}) {
  const queryClient = useQueryClient()
  const [readyItemId, setReadyItemId] = useState<string | null>(null)

  useEffect(() => {
    if (!overviewSettled) {
      return
    }

    const options = vmResourcesQueryOptions(itemId)
    if (initialResources) {
      queryClient.setQueryData(options.queryKey, initialResources)
      setReadyItemId(itemId)
      return
    }

    if (!enabled) {
      return
    }

    if (queryClient.getQueryData(options.queryKey) !== undefined) {
      setReadyItemId(itemId)
      return
    }

    const timeout = window.setTimeout(() => {
      setReadyItemId(itemId)
    }, VM_RESOURCE_POLL_INTERVAL_MS)

    return () => window.clearTimeout(timeout)
  }, [enabled, initialResources, itemId, overviewSettled, queryClient])

  return useQuery({
    ...vmResourcesQueryOptions(itemId),
    enabled: enabled && readyItemId === itemId,
  })
}
