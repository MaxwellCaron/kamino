import { apiUrl } from "@/features/auth/api/auth-api"

type JsonEventHandlers<TEvents extends object> = {
  [K in keyof TEvents & string]?: (
    payload: TEvents[K],
    event: MessageEvent<string>
  ) => void
}

export type JsonEventStreamOpenInfo = {
  reconnected: boolean
}

export type JsonEventStreamOptions = {
  onOpen?: (info: JsonEventStreamOpenInfo) => void
}

export function subscribeToJsonEventStream<TEvents extends object>(
  path: string,
  handlers: JsonEventHandlers<TEvents>,
  options?: JsonEventStreamOptions
) {
  let closed = false
  let hasOpened = false

  const source = new EventSource(apiUrl(path), {
    withCredentials: true,
  })

  source.addEventListener("open", () => {
    if (closed) return
    options?.onOpen?.({ reconnected: hasOpened })
    hasOpened = true
  })

  for (const eventType of Object.keys(handlers) as Array<
    keyof TEvents & string
  >) {
    const handler = handlers[eventType]
    if (!handler) continue

    source.addEventListener(eventType, (event) => {
      if (closed) return

      const message = event as MessageEvent<string>

      try {
        handler(JSON.parse(message.data) as TEvents[typeof eventType], message)
      } catch (err) {
        console.error(`Failed to parse ${eventType} event:`, err)
      }
    })
  }

  return () => {
    closed = true
    source.close()
  }
}
