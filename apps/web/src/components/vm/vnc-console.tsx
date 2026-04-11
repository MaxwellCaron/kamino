import { useEffect, useRef, useState } from "react"
import {
  IconKeyboard,
  IconPlugConnected,
  IconPlugConnectedX,
  IconPower,
  IconTerminal,
  IconX,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
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
  node: string | null
  vmid: number | null
  powerStatus?: string
  isLoading?: boolean
}

type Status = "connecting" | "connected" | "disconnected" | "error"

export function VncConsole({
  node,
  vmid,
  powerStatus,
  isLoading,
}: VncConsoleProps) {
  const screenRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<RFB | null>(null)
  const [status, setStatus] = useState<Status>("disconnected")
  const [error, setError] = useState<string>()
  const [connectAttempt, setConnectAttempt] = useState(0)
  const [shouldConnect, setShouldConnect] = useState(false)
  const [connectedAt, setConnectedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!shouldConnect || !node || vmid == null) return

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

        rfb.addEventListener("connect", () => {
          if (!cancelled) {
            setStatus("connected")
            setConnectedAt(Date.now())
          }
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
    setConnectedAt(null)
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
          <ConsoleToolbar
            status={status}
            error={error}
            connectedAt={connectedAt}
            rfb={rfbRef}
            onDisconnect={disconnect}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="relative flex h-[83vh] items-center justify-center bg-muted/50">
        {status !== "connected" && (
          <Empty className="w-full max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {isLoading ? (
                  <Spinner className="size-5" />
                ) : powerStatus !== "running" ? (
                  <IconPower />
                ) : (
                  <IconPlugConnectedX />
                )}
              </EmptyMedia>
              <EmptyTitle>
                {isLoading
                  ? "VM state..."
                  : powerStatus !== "running"
                    ? "VM Not Running"
                    : "Not Connected"}
              </EmptyTitle>
              <EmptyDescription>
                {isLoading
                  ? "Fetching VM details. Details are required before starting a new session."
                  : powerStatus !== "running"
                    ? "The VM must be running to create a VNC session."
                    : "You haven't created a VNC session. Start a new session to connect."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              <Button
                onClick={startConnection}
                disabled={
                  isLoading ||
                  status === "connecting" ||
                  powerStatus !== "running" ||
                  !node ||
                  vmid == null
                }
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

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":")
}

function useElapsed(since: number | null): string {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (since === null) {
      setElapsed(0)
      return
    }

    setElapsed(Math.floor((Date.now() - since) / 1000))
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - since) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [since])

  return formatElapsed(elapsed)
}

const KEY_COMBOS = [
  {
    label: "Ctrl + Alt + Del",
    action: (rfb: RFB) => rfb.sendCtrlAltDel(),
  },
  {
    label: "Tab",
    action: (rfb: RFB) => rfb.sendKey(0xff09, "Tab"),
  },
  {
    label: "Escape",
    action: (rfb: RFB) => rfb.sendKey(0xff1b, "Escape"),
  },
  {
    label: "F11",
    action: (rfb: RFB) => rfb.sendKey(0xffc8, "F11"),
  },
] as const

function ConsoleToolbar({
  status,
  error,
  connectedAt,
  rfb,
  onDisconnect,
}: {
  status: Status
  error: string | undefined
  connectedAt: number | null
  rfb: React.RefObject<RFB | null>
  onDisconnect: () => void
}) {
  const elapsed = useElapsed(status === "connected" ? connectedAt : null)

  function send(action: (rfb: RFB) => void) {
    if (rfb.current) {
      action(rfb.current)
      rfb.current.focus()
    }
  }

  switch (status) {
    case "connected":
      return (
        <div className="flex items-center gap-2">
          <Badge>
            <IconPlugConnected />
            <span className="font-mono">{elapsed}</span>
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="xs">
                  <IconKeyboard />
                  Send Keys
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {KEY_COMBOS.map((combo) => (
                <DropdownMenuItem
                  key={combo.label}
                  onClick={() => send(combo.action)}
                >
                  {combo.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="destructive"
                    size="icon-xs"
                    onClick={onDisconnect}
                  >
                    <IconX />
                  </Button>
                }
              />
              <TooltipContent>Disconnect</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
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
