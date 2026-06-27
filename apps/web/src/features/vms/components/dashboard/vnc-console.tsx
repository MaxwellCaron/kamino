import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import {
  IconKeyboard,
  IconPlugConnected,
  IconPlugConnectedX,
  IconPower,
  IconTerminal2,
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
import type { VncScreenHandle } from "react-vnc"

import { AppActionButton } from "@/components/actions/app-action-button"
import { apiFetch, apiUrl } from "@/features/auth/api/auth-api"

const LazyVncScreen = lazy(() =>
  import("./vnc-screen-client").then((module) => ({
    default: module.VncScreenClient,
  }))
)

type VncConsoleProps = {
  itemId: string
  powerStatus?: string
}

type Status = "connecting" | "connected" | "disconnected" | "error"

type Session = {
  url: string
  password: string
}

export function VncConsole({ itemId, powerStatus }: VncConsoleProps) {
  const vncRef = useRef<VncScreenHandle>(null)
  const connectingRef = useRef(false)
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<Status>("disconnected")
  const [error, setError] = useState<string>()
  const [connectedAt, setConnectedAt] = useState<number | null>(null)

  useEffect(() => {
    return () => {
      vncRef.current?.disconnect()
    }
  }, [])

  async function startConnection() {
    if (connectingRef.current) return
    connectingRef.current = true
    setStatus("connecting")
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

      setSession({ url: wsHttpUrl.toString(), password })
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Connection failed")
    } finally {
      connectingRef.current = false
    }
  }

  function disconnect() {
    vncRef.current?.disconnect()
    setSession(null)
    setStatus("disconnected")
    setError(undefined)
    setConnectedAt(null)
  }

  const handleConnect = useCallback(() => {
    setStatus("connected")
    setConnectedAt(Date.now())
  }, [])

  const handleDisconnect = useCallback(() => {
    setStatus("disconnected")
  }, [])

  const handleSecurityFailure = useCallback(() => {
    setStatus("error")
    setError("Authentication failed")
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconTerminal2 className="size-5 text-muted-foreground" />
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
                {powerStatus !== "running" ? (
                  <IconPower className="text-muted-foreground" />
                ) : (
                  <IconPlugConnectedX className="text-muted-foreground" />
                )}
              </EmptyMedia>
              <EmptyTitle>
                {powerStatus !== "running" ? "VM Not Running" : "Not Connected"}
              </EmptyTitle>
              <EmptyDescription>
                {powerStatus !== "running"
                  ? "The VM must be running to create a VNC session."
                  : "You haven't created a VNC session. Start a new session to connect."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              <AppActionButton
                onClick={startConnection}
                disabled={powerStatus !== "running" || !itemId}
                pending={status === "connecting"}
                pendingLabel="Connecting..."
              >
                Connect
              </AppActionButton>
            </EmptyContent>
          </Empty>
        )}

        {session && (
          <Suspense
            fallback={
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ width: "100%", height: "100%" }}
              >
                <Spinner />
              </div>
            }
          >
            <LazyVncScreen
              ref={vncRef}
              url={session.url}
              rfbOptions={{ credentials: { password: session.password } }}
              scaleViewport
              resizeSession={false}
              qualityLevel={8}
              compressionLevel={2}
              background="transparent"
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onSecurityFailure={handleSecurityFailure}
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

function useElapsed(since: number | null): string {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (since === null) {
      return
    }
    const id = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(id)
  }, [since])

  const elapsed =
    since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000))
  return formatElapsed(elapsed)
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
  vncRef,
  onDisconnect,
}: {
  status: Status
  error: string | undefined
  connectedAt: number | null
  vncRef: React.RefObject<VncScreenHandle | null>
  onDisconnect: () => void
}) {
  const elapsed = useElapsed(status === "connected" ? connectedAt : null)

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
            <IconPlugConnected />
            <span className="font-mono">{elapsed}</span>
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="xs">
                  <IconKeyboard data-icon="inline-start" />
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
