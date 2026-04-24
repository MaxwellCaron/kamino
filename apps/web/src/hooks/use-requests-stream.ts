import { useQueryClient } from "@tanstack/react-query"
import { useAuthenticatedEventSource } from "@/hooks/use-authenticated-event-source"

export type RequestEvent = {
  type: string
  request_id?: string
  timestamp: string
}

export function useRequestsStream(enabled = true) {
  const queryClient = useQueryClient()

  useAuthenticatedEventSource({
    path: "/api/v1/requests/events",
    enabled,
    onMessage: (event) => {
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
    },
  })
}
