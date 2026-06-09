import { apiUrl } from "@/features/auth/api/auth-api"

type JsonEventHandlers<TEvents extends object> = {
  [K in keyof TEvents & string]?: (
    payload: TEvents[K],
    event: MessageEvent<string>
  ) => void
}

export function subscribeToJsonEventStream<TEvents extends object>(
  path: string,
  handlers: JsonEventHandlers<TEvents>
) {
  const source = new EventSource(apiUrl(path), {
    withCredentials: true,
  })

  for (const eventType of Object.keys(handlers) as Array<
    keyof TEvents & string
  >) {
    const handler = handlers[eventType]
    if (!handler) continue

    source.addEventListener(eventType, (event) => {
      const message = event as MessageEvent<string>

      try {
        handler(JSON.parse(message.data) as TEvents[typeof eventType], message)
      } catch (err) {
        console.error(`Failed to parse ${eventType} event:`, err)
      }
    })
  }

  return () => {
    source.close()
  }
}
