import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiUrl, ensureAuth, vmStatusQueryOptions } from "@/lib/queries"

type VmStatusEvent = {
  type: "vm.statuses.changed"
  statuses: Record<number, string>
  timestamp: string
}

export function VmStatusEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let eventSource: EventSource | null = null
    let cancelled = false
    let reconnectTimer: number | null = null

    const handleStatusesChanged = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = JSON.parse(event.data) as VmStatusEvent
      queryClient.setQueryData(vmStatusQueryOptions.queryKey, payload.statuses)
    }

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const cleanupEventSource = () => {
      if (!eventSource) {
        return
      }

      eventSource.removeEventListener("vm.statuses.changed", handleStatusesChanged)
      eventSource.onerror = null
      eventSource.close()
      eventSource = null
    }

    const scheduleReconnect = (delayMs: number) => {
      clearReconnectTimer()
      if (cancelled) {
        return
      }

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        void connect()
      }, delayMs)
    }

    const connect = async () => {
      try {
        await ensureAuth()
        if (cancelled) {
          return
        }

        cleanupEventSource()

        eventSource = new EventSource(apiUrl("/api/v1/vms/events"), {
          withCredentials: true,
        })
        eventSource.addEventListener(
          "vm.statuses.changed",
          handleStatusesChanged
        )
        eventSource.onerror = () => {
          cleanupEventSource()
          scheduleReconnect(1_000)
        }
      } catch {
        // ensureAuth() redirects on auth failures. Retry later for transient errors.
        scheduleReconnect(5_000)
      }
    }

    void connect()

    return () => {
      cancelled = true
      clearReconnectTimer()
      cleanupEventSource()
    }
  }, [queryClient])

  return null
}
