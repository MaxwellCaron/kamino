import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  Clock01Icon,
  ConnectIcon,
  Download01Icon,
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
  DropdownMenuGroup,
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
import type { VncScreenClientHandle } from "./vnc-screen-client"
import { AppActionButton } from "@/components/actions/app-action-button"
import { apiFetch, apiUrl } from "@/features/auth/api/auth-api"
import { vmOverviewQueryOptions } from "@/features/vms/api/vm-api"
import { downloadSpiceConfig } from "@/features/vms/api/vm-console-api"
import { alignVncLayoutAnchorIfOverscrolled } from "@/features/vms/components/dashboard/vnc-layout-anchor"
import { toastDownloadSpiceConfig } from "@/features/vms/utils/vm-toasts"
import { supportsNativeSpice } from "@/features/vms/utils/vm-console-utils"

function preloadVncScreenClient() {
  void import("./vnc-screen-client")
}

const LazyVncScreen = lazy(() =>
  import("./vnc-screen-client").then((module) => ({
    default: module.VncScreenClient,
  }))
)

export type VncConnectionStatus =
  "connecting" | "connected" | "disconnected" | "expired" | "error"

type VncConsoleProps = {
  itemId: string
  guestType?: "qemu" | "lxc"
  powerStatus?: string
  vmName?: string | null
  vmid?: number | null
  isViewed: boolean
  onStatusChange: (status: VncConnectionStatus) => void
}

type Session = {
  sessionId: string
  url: string
  password: string
}

const VNC_IDLE_TIMEOUT_MS = 30 * 60 * 1000

function getDisconnectedConsoleCopy(isRunning: boolean, isExpired: boolean) {
  if (!isRunning) {
    return {
      description: "The VM must be running to open a console.",
      icon: PowerIcon,
      title: "VM Not Running",
    }
  }

  if (isExpired) {
    return {
      description:
        "This console was closed after 30 minutes away. Connect to start a new session.",
      icon: Clock01Icon,
      title: "Session Expired",
    }
  }

  return {
    description: "Connect to start an in-app console session.",
    icon: ConnectIcon,
    title: "Not Connected",
  }
}

function DisconnectedConsoleState({
  isRunning,
  isExpired,
  itemId,
  onConnect,
  onDownloadSpiceConfig,
  showSpiceDownload,
  spiceDownloadInFlight,
  status,
}: {
  isRunning: boolean
  isExpired: boolean
  itemId: string
  onConnect: () => void
  onDownloadSpiceConfig: () => void
  showSpiceDownload: boolean
  spiceDownloadInFlight: boolean
  status: VncConnectionStatus
}) {
  const copy = getDisconnectedConsoleCopy(isRunning, isExpired)

  return (
    <Empty className="w-full max-w-md">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={copy.icon} className="text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>{copy.title}</EmptyTitle>
        <EmptyDescription>{copy.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex flex-row flex-wrap justify-center gap-2">
        <AppActionButton
          onClick={onConnect}
          disabled={!isRunning || !itemId}
          pending={status === "connecting"}
          pendingLabel="Connecting..."
        >
          Connect
        </AppActionButton>
        {showSpiceDownload ? (
          <AppActionButton
            variant="outline"
            onClick={onDownloadSpiceConfig}
            disabled={!isRunning || !itemId || spiceDownloadInFlight}
          >
            <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
            Download SPICE config
          </AppActionButton>
        ) : null}
      </EmptyContent>
    </Empty>
  )
}

function VncScreenSession({
  onConnect,
  onDisconnect,
  onSecurityFailure,
  session,
  vncRef,
}: {
  onConnect: (sessionId: string) => void
  onDisconnect: (sessionId: string) => void
  onSecurityFailure: (sessionId: string) => void
  session: Session | null
  vncRef: React.RefObject<VncScreenClientHandle | null>
}) {
  if (!session) return null

  return (
    <Suspense fallback={null}>
      <LazyVncScreen
        key={session.sessionId}
        ref={vncRef}
        url={session.url}
        password={session.password}
        onConnect={() => onConnect(session.sessionId)}
        onDisconnect={() => onDisconnect(session.sessionId)}
        onSecurityFailure={() => onSecurityFailure(session.sessionId)}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          inset: 0,
        }}
      />
    </Suspense>
  )
}

function VncConsoleContent({
  handleConnect,
  handleDisconnect,
  handleSecurityFailure,
  isExpired,
  isRunning,
  itemId,
  onConnect,
  onDownloadSpiceConfig,
  session,
  showSpiceDownload,
  spiceDownloadInFlight,
  status,
  vncRef,
}: {
  handleConnect: (sessionId: string) => void
  handleDisconnect: (sessionId: string) => void
  handleSecurityFailure: (sessionId: string) => void
  isExpired: boolean
  isRunning: boolean
  itemId: string
  onConnect: () => void
  onDownloadSpiceConfig: () => void
  session: Session | null
  showSpiceDownload: boolean
  spiceDownloadInFlight: boolean
  status: VncConnectionStatus
  vncRef: React.RefObject<VncScreenClientHandle | null>
}) {
  return (
    <CardContent className="relative flex h-[83vh] items-center justify-center bg-muted/50">
      {status !== "connected" ? (
        <DisconnectedConsoleState
          isRunning={isRunning}
          isExpired={isExpired}
          itemId={itemId}
          onConnect={onConnect}
          onDownloadSpiceConfig={onDownloadSpiceConfig}
          showSpiceDownload={showSpiceDownload}
          spiceDownloadInFlight={spiceDownloadInFlight}
          status={status}
        />
      ) : null}
      <VncScreenSession
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onSecurityFailure={handleSecurityFailure}
        session={session}
        vncRef={vncRef}
      />
    </CardContent>
  )
}

export function VncConsole({
  itemId,
  guestType,
  powerStatus,
  vmName,
  vmid,
  isViewed,
  onStatusChange,
}: VncConsoleProps) {
  const vncRef = useRef<VncScreenClientHandle>(null)
  const connectingRef = useRef(false)
  const activeSessionIdRef = useRef<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<VncConnectionStatus>("disconnected")
  const [error, setError] = useState<string>()
  const [connectedAt, setConnectedAt] = useState<number | null>(null)
  const [spiceDownloadInFlight, setSpiceDownloadInFlight] = useState(false)
  const { data: overview } = useQuery({
    ...vmOverviewQueryOptions(itemId),
    enabled: Boolean(itemId) && guestType === "qemu",
  })
  const showSpiceDownload = supportsNativeSpice(guestType, overview?.display)

  useEffect(() => {
    if (powerStatus === "running" && itemId) {
      preloadVncScreenClient()
    }
  }, [powerStatus, itemId])

  function handleDownloadSpiceConfig() {
    if (spiceDownloadInFlight || !itemId || powerStatus !== "running") {
      return
    }

    setSpiceDownloadInFlight(true)
    toastDownloadSpiceConfig(
      downloadSpiceConfig(itemId).finally(() => {
        setSpiceDownloadInFlight(false)
      }),
      vmid,
      vmName
    )
  }

  async function startConnection() {
    if (connectingRef.current) return
    preloadVncScreenClient()
    alignVncLayoutAnchorIfOverscrolled()
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
        vncRef.current?.refreshViewport()
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
          {showSpiceDownload
            ? "Connect to this VM's console in Kamino or open it in a native SPICE client."
            : "Connect to this VM's console in Kamino."}
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
      <VncConsoleContent
        handleConnect={handleConnect}
        handleDisconnect={handleDisconnect}
        handleSecurityFailure={handleSecurityFailure}
        isExpired={isExpired}
        isRunning={isRunning}
        itemId={itemId}
        onConnect={startConnection}
        onDownloadSpiceConfig={handleDownloadSpiceConfig}
        session={session}
        showSpiceDownload={showSpiceDownload}
        spiceDownloadInFlight={spiceDownloadInFlight}
        status={status}
        vncRef={vncRef}
      />
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
    action: (ref: VncScreenClientHandle) => ref.sendCtrlAltDel(),
  },
  {
    label: "Tab",
    action: (ref: VncScreenClientHandle) => ref.sendKey(0xff09, "Tab"),
  },
  {
    label: "Escape",
    action: (ref: VncScreenClientHandle) => ref.sendKey(0xff1b, "Escape"),
  },
  {
    label: "F11",
    action: (ref: VncScreenClientHandle) => ref.sendKey(0xffc8, "F11"),
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
  vncRef: React.RefObject<VncScreenClientHandle | null>
  onDisconnect: () => void
}) {
  const elapsed = useElapsed(
    status === "connected" ? connectedAt : null,
    isViewed
  )

  function send(action: (ref: VncScreenClientHandle) => void) {
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
              <DropdownMenuGroup>
                {KEY_COMBOS.map((combo) => (
                  <DropdownMenuItem
                    key={combo.label}
                    onClick={() => send(combo.action)}
                  >
                    {combo.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="destructive"
                    size="icon-xs"
                    aria-label="Disconnect VNC session"
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
