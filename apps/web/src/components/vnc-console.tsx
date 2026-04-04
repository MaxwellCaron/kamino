import { useEffect, useRef, useState } from "react"
import {
  IconPlugConnected,
  IconPlugConnectedX,
  IconTerminal,
} from "@tabler/icons-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Spinner } from "@workspace/ui/components/spinner"

import type RFB from "@novnc/novnc/core/rfb.js"

type VncConsoleProps = {
  node: string
  vmid: number
}

type Status = "connecting" | "connected" | "disconnected" | "error"

export function VncConsole({ node, vmid }: VncConsoleProps) {
  const screenRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<RFB | null>(null)
  const [status, setStatus] = useState<Status>("disconnected")
  const [error, setError] = useState<string>()
  const [connectAttempt, setConnectAttempt] = useState(0)
  const [shouldConnect, setShouldConnect] = useState(false)

  useEffect(() => {
    if (!shouldConnect) return

    let cancelled = false

    async function connect() {
      try {
        const res = await fetch("/api/v1/vnc/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ node, vmid }),
        })

        if (!res.ok) {
          throw new Error(`Proxy request failed: ${res.status}`)
        }

        const { sessionId, password } = (await res.json()) as {
          sessionId: string
          password: string
        }

        if (cancelled || !screenRef.current) return

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
        // In dev, connect directly to Go backend — Nitro's devProxy strips WebSocket upgrade headers
        const wsHost = import.meta.env.DEV
          ? "localhost:8080"
          : window.location.host
        const wsUrl = `${protocol}//${wsHost}/api/v1/vnc/ws`

        const ws = new WebSocket(wsUrl)
        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => {
            ws.send(JSON.stringify({ sessionId }))
            resolve()
          }
          ws.onerror = () => reject(new Error("WebSocket connection failed"))
        })

        const { default: RFB } = await import("@novnc/novnc/core/rfb.js")

        const rfb = new RFB(screenRef.current, ws, {
          credentials: { password },
        })

        rfb.scaleViewport = true
        rfb.resizeSession = true

        rfb.addEventListener("connect", () => {
          if (!cancelled) setStatus("connected")
        })

        rfb.addEventListener("disconnect", (e: Event) => {
          if (!cancelled) {
            setStatus("disconnected")
            if (!(e as CustomEvent).detail?.clean) {
              setError("Connection lost unexpectedly")
            }
          }
        })

        rfbRef.current = rfb
      } catch (err) {
        if (!cancelled) {
          setStatus("error")
          setError(err instanceof Error ? err.message : "Connection failed")
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      rfbRef.current?.disconnect()
      rfbRef.current = null
    }
  }, [node, vmid, connectAttempt, shouldConnect])

  function startConnection() {
    rfbRef.current?.disconnect()
    rfbRef.current = null
    if (screenRef.current) {
      screenRef.current.innerHTML = ""
    }
    setStatus("connecting")
    setError(undefined)
    setShouldConnect(true)
    setConnectAttempt((n) => n + 1)
  }

  function disconnect() {
    rfbRef.current?.disconnect()
    rfbRef.current = null
    if (screenRef.current) {
      screenRef.current.innerHTML = ""
    }
    setShouldConnect(false)
    setStatus("disconnected")
    setError(undefined)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconTerminal className="size-5" />
          Console
        </CardTitle>
        <CardDescription>
          Connect directly to the GUI interface of this VM using a VNC client
          connection.
        </CardDescription>

        <CardAction>
          <StatusIndicator status={status} error={error} />
        </CardAction>
      </CardHeader>

      <CardContent className="relative flex h-[83vh] items-center justify-center bg-muted/50">
        {status !== "connected" && (
          <Empty className="w-full max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconPlugConnectedX />
              </EmptyMedia>
              <EmptyTitle>Not Connected</EmptyTitle>
              <EmptyDescription>
                You haven&apos;t created a VNC session. Start a new session to
                connect.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              <Button
                onClick={startConnection}
                disabled={status === "connecting"}
              >
                {status === "connecting" && <Spinner />}
                {status === "connecting" ? "Connecting..." : "Connect"}
              </Button>
            </EmptyContent>
          </Empty>
        )}

        <div
          ref={screenRef}
          className={`absolute inset-0 h-full w-full ${
            status === "connected"
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        />
      </CardContent>
    </Card>
  )
}

function StatusIndicator({
  status,
  error,
}: {
  status: Status
  error: string | undefined
}) {
  switch (status) {
    case "connected":
      return (
        <Badge>
          <IconPlugConnected />
          Connected
        </Badge>
      )
    case "disconnected":
    case "error":
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="destructive">
                <IconPlugConnectedX />
                {status === "error" ? "Error" : "Disconnected"}
              </Badge>
            </TooltipTrigger>
            {error && <TooltipContent>{error}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      )
    default:
      return null
  }
}
