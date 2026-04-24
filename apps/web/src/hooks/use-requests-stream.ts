import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiUrl } from "@/lib/queries"

export type RequestEvent = {
  type: string
  request_id?: string
  timestamp: string
}

export function useRequestsStream(enabled = true) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return

    const url = apiUrl("/api/v1/requests/events")
    const eventSource = new EventSource(url, { withCredentials: true })

    eventSource.onmessage = (event) => {
      try {
        const data: RequestEvent = JSON.parse(event.data)

        void queryClient.invalidateQueries({ queryKey: ["requests"] })
        if (data.request_id) {
          void queryClient.invalidateQueries({
            queryKey: ["requests", data.request_id],
          })
        }
      } catch (err) {
        console.error("Failed to parse request event:", err)
      }
    }

    eventSource.onerror = (err) => {
      console.error("Request stream error:", err)
    }

    return () => {
      eventSource.close()
    }
  }, [enabled, queryClient])
}
