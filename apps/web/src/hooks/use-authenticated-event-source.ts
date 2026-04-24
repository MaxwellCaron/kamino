import { useEffect, useRef } from "react"
import { apiUrl, ensureAuth } from "@/lib/queries"

type EventSourceHandler = (event: Event) => void

type UseAuthenticatedEventSourceOptions = {
  path: string
  enabled?: boolean
  onMessage?: (event: MessageEvent<string>) => void
  eventHandlers?: Record<string, EventSourceHandler>
}

export function useAuthenticatedEventSource({
  path,
  enabled = true,
  onMessage,
  eventHandlers,
}: UseAuthenticatedEventSourceOptions) {
  const onMessageRef = useRef(onMessage)
  const eventHandlersRef = useRef(eventHandlers)

  onMessageRef.current = onMessage
  eventHandlersRef.current = eventHandlers

  const eventTypes = Object.keys(eventHandlers ?? {}).sort()
  const eventTypesKey = eventTypes.join("|")

  useEffect(() => {
    if (!enabled) {
      return
    }

    let eventSource: EventSource | null = null
    let cancelled = false
    let reconnectTimer: number | null = null
    let registeredEventHandlers: Array<{
      eventType: string
      handler: EventSourceHandler
    }> = []

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

      for (const { eventType, handler } of registeredEventHandlers) {
        eventSource.removeEventListener(eventType, handler)
      }
      registeredEventHandlers = []
      eventSource.onmessage = null
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

        const source = new EventSource(apiUrl(path), {
          withCredentials: true,
        })

        source.onmessage = (event) => {
          onMessageRef.current?.(event)
        }

        for (const eventType of eventTypes) {
          const handler: EventSourceHandler = (event) => {
            eventHandlersRef.current?.[eventType]?.(event)
          }

          registeredEventHandlers.push({ eventType, handler })
          source.addEventListener(eventType, handler)
        }

        source.onerror = () => {
          cleanupEventSource()
          scheduleReconnect(1_000)
        }

        eventSource = source
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
  }, [enabled, eventTypesKey, path])
}
