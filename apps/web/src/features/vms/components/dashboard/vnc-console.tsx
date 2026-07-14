import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  Clock01Icon,
  ConnectIcon,
  KeyboardIcon,
  Plug01Icon,
  PowerIcon,
  TerminalIcon,
} from "@hugeicons/core-free-icons"
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
import type { VncScreenHandle } from "react-vnc"

import { AppActionButton } from "@/components/actions/app-action-button"
import { apiFetch, apiUrl } from "@/features/auth/api/auth-api"

const LazyVncScreen = lazy(() =>
  import("./vnc-screen-client").then((module) => ({
    default: module.VncScreenClient,
  }))
)

export type VncConnectionStatus =
  "connecting" | "connected" | "disconnected" | "expired" | "error"

type VncConsoleProps = {
  itemId: string
  powerStatus?: string
  isViewed: boolean
  onStatusChange: (status: VncConnectionStatus) => void
}

type Session = {
  sessionId: string
  url: string
  password: string
}

const VNC_IDLE_TIMEOUT_MS = 30 * 60 * 1000

export function VncConsole({
  itemId,
  powerStatus,
  isViewed,
  onStatusChange,
}: VncConsoleProps) {
  const vncRef = useRef<VncScreenHandle>(null)
  const connectingRef = useRef(false)
  const activeSessionIdRef = useRef<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<VncConnectionStatus>("disconnected")
  const [error, setError] = useState<string>()
  const [connectedAt, setConnectedAt] = useState<number | null>(null)

  async function startConnection() {
    if (connectingRef.current) return
    connectingRef.current = true
    setStatus("connecting")
    onStatusChange("connecting")
    setError(undefined)

    try {
      const res = await apiFetch(
        `/api/v1/inventory/items/${itemId}/vm/vnc/proxy`,
        { method: "POST" }
      )

      if (!res.ok) {
        throw new Error(`Proxy request failed: ${res.status}`)
      }

      const { sessionId, password } = (await res.json()) as {
        sessionId: string
        password: string
      }

      const wsHttpUrl = new URL(
        apiUrl("/api/v1/vnc/ws"),
        window.location.origin
      )
      wsHttpUrl.protocol = wsHttpUrl.protocol === "https:" ? "wss:" : "ws:"
      wsHttpUrl.searchParams.set("sessionId", sessionId)

      activeSessionIdRef.current = sessionId
      setSession({ sessionId, url: wsHttpUrl.toString(), password })
    } catch (err) {
      setStatus("error")
      onStatusChange("error")
      setError(err instanceof Error ? err.message : "Connection failed")
    } finally {
      connectingRef.current = false
    }
  }

  const closeConnection = useCallback(() => {
    const activeConnection = vncRef.current
    activeSessionIdRef.current = null
    activeConnection?.disconnect()
    setSession(null)
    setError(undefined)
    setConnectedAt(null)
  }, [])

  const disconnect = useCallback(() => {
    closeConnection()
    setStatus("disconnected")
    onStatusChange("disconnected")
  }, [closeConnection, onStatusChange])

  const handleConnect = useCallback(
    (sessionId: string) => {
      if (activeSessionIdRef.current !== sessionId) {
        return
      }

      setStatus("connected")
      onStatusChange("connected")
      setConnectedAt(Date.now())
    },
    [onStatusChange]
  )

  const handleDisconnect = useCallback(
    (sessionId: string) => {
      if (activeSessionIdRef.current !== sessionId) {
        return
      }

      activeSessionIdRef.current = null
      setSession(null)
      setStatus("disconnected")
      onStatusChange("disconnected")
      setConnectedAt(null)
    },
    [onStatusChange]
  )

  const handleSecurityFailure = useCallback(
    (sessionId: string) => {
      if (activeSessionIdRef.current !== sessionId) {
        return
      }

      setStatus("error")
      onStatusChange("error")
      setError("Authentication failed")
    },
    [onStatusChange]
  )

  const expireConnection = useCallback(() => {
    closeConnection()
    setStatus("expired")
    onStatusChange("expired")
  }, [closeConnection, onStatusChange])

  useVncIdleExpiry(status === "connected", isViewed, expireConnection)

  useEffect(() => {
    if (status !== "connected" || !isViewed) {
      return
    }

    let secondFrameId = 0
    const firstFrameId = requestAnimationFrame(() => {
      secondFrameId = requestAnimationFrame(() => {
        const rfb = vncRef.current?.rfb
        if (!rfb) {
          return
        }
        rfb.scaleViewport = false
        rfb.scaleViewport = true
      })
    })

    return () => {
      cancelAnimationFrame(firstFrameId)
      if (secondFrameId !== 0) {
        cancelAnimationFrame(secondFrameId)
      }
    }
  }, [status, isViewed])

  const isRunning = powerStatus === "running"
  const isExpired = status === "expired"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={TerminalIcon}
            className="size-5 text-muted-foreground"
          />
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
            isViewed={isViewed}
            vncRef={vncRef}
            onDisconnect={disconnect}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="relative flex h-[83vh] items-center justify-center bg-muted/50">
        {status !== "connected" && (
          <Empty className="w-full max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {!isRunning ? (
                  <HugeiconsIcon
                    icon={PowerIcon}
                    className="text-muted-foreground"
                  />
                ) : isExpired ? (
                  <HugeiconsIcon
                    icon={Clock01Icon}
                    className="text-muted-foreground"
                  />
                ) : (
                  <HugeiconsIcon
                    icon={ConnectIcon}
                    className="text-muted-foreground"
                  />
                )}
              </EmptyMedia>
              <EmptyTitle>
                {!isRunning
                  ? "VM Not Running"
                  : isExpired
                    ? "Session Expired"
                    : "Not Connected"}
              </EmptyTitle>
              <EmptyDescription>
                {!isRunning
                  ? "The VM must be running to create a VNC session."
                  : isExpired
                    ? "This console was closed after 30 minutes away. Connect to start a new session."
                    : "You haven't created a VNC session. Start a new session to connect."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              <AppActionButton
                onClick={startConnection}
                disabled={!isRunning || !itemId}
                pending={status === "connecting"}
                pendingLabel="Connecting..."
              >
                Connect
              </AppActionButton>
            </EmptyContent>
          </Empty>
        )}

        {session && (
          <Suspense fallback={null}>
            <LazyVncScreen
              key={session.sessionId}
              ref={vncRef}
              url={session.url}
              rfbOptions={{ credentials: { password: session.password } }}
              scaleViewport
              resizeSession={false}
              qualityLevel={8}
              compressionLevel={2}
              background="transparent"
              onConnect={() => handleConnect(session.sessionId)}
              onDisconnect={() => handleDisconnect(session.sessionId)}
              onSecurityFailure={() => handleSecurityFailure(session.sessionId)}
              style={{
                width: "100%",
                height: "100%",
                position: "absolute",
                inset: 0,
              }}
            />
          </Suspense>
        )}
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

function useElapsed(since: number | null, active: boolean): string {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (since === null || !active) {
      return
    }
    const id = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(id)
  }, [since, active])

  const elapsed =
    since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000))
  return formatElapsed(elapsed)
}

function useVncIdleExpiry(
  connected: boolean,
  isViewed: boolean,
  onExpire: () => void
) {
  const deadlineRef = useRef<number | null>(null)

  useEffect(() => {
    if (!connected) {
      deadlineRef.current = null
      return
    }

    const now = Date.now()
    const existingDeadline = deadlineRef.current

    if (isViewed) {
      if (existingDeadline !== null && now >= existingDeadline) {
        deadlineRef.current = null
        onExpire()
        return
      }

      deadlineRef.current = null
      return
    }

    const deadline = existingDeadline ?? now + VNC_IDLE_TIMEOUT_MS
    deadlineRef.current = deadline

    const timeoutId = window.setTimeout(
      () => {
        if (deadlineRef.current !== null && Date.now() >= deadline) {
          deadlineRef.current = null
          onExpire()
        }
      },
      Math.max(0, deadline - now)
    )

    return () => window.clearTimeout(timeoutId)
  }, [connected, isViewed, onExpire])
}

const KEY_COMBOS = [
  {
    label: "Ctrl + Alt + Del",
    action: (ref: VncScreenHandle) => ref.sendCtrlAltDel(),
  },
  {
    label: "Tab",
    action: (ref: VncScreenHandle) => ref.sendKey(0xff09, "Tab"),
  },
  {
    label: "Escape",
    action: (ref: VncScreenHandle) => ref.sendKey(0xff1b, "Escape"),
  },
  {
    label: "F11",
    action: (ref: VncScreenHandle) => ref.sendKey(0xffc8, "F11"),
  },
] as const

function ConsoleToolbar({
  status,
  error,
  connectedAt,
  isViewed,
  vncRef,
  onDisconnect,
}: {
  status: VncConnectionStatus
  error: string | undefined
  connectedAt: number | null
  isViewed: boolean
  vncRef: React.RefObject<VncScreenHandle | null>
  onDisconnect: () => void
}) {
  const elapsed = useElapsed(
    status === "connected" ? connectedAt : null,
    isViewed
  )

  function send(action: (ref: VncScreenHandle) => void) {
    if (vncRef.current) {
      action(vncRef.current)
      vncRef.current.focus()
    }
  }

  switch (status) {
    case "connected":
      return (
        <div className="flex items-center gap-2">
          <Badge>
            <HugeiconsIcon icon={Plug01Icon} data-icon="inline-start" />
            <span className="font-mono">{elapsed}</span>
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="xs">
                  <HugeiconsIcon icon={KeyboardIcon} data-icon="inline-start" />
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
                    <HugeiconsIcon icon={Cancel01Icon} />
                  </Button>
                }
              />
              <TooltipContent>Disconnect</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )
    case "expired":
      return (
        <Badge variant="secondary">
          <HugeiconsIcon icon={Clock01Icon} data-icon="inline-start" />
          Expired
        </Badge>
      )
    case "disconnected":
    case "error":
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="destructive">
                <HugeiconsIcon icon={ConnectIcon} data-icon="inline-start" />
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
