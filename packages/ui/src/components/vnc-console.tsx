"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconLoader2,
  IconServer,
  IconPlugConnected,
  IconPlugConnectedX,
} from "@tabler/icons-react"
import type RFB from "@novnc/novnc/core/rfb.js"

type VncConsoleProps = {
  node: string
  vmid: number
}

type Status = "connecting" | "connected" | "disconnected" | "error"

export function VncConsole({ node, vmid }: VncConsoleProps) {
  const screenRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<RFB | null>(null)
  const [status, setStatus] = useState<Status>("connecting")
  const [error, setError] = useState<string>()
  const [connectAttempt, setConnectAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function connect() {
      try {
        // Step 1: Get VNC proxy session from our server
        const res = await fetch("/api/vnc/proxy", {
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

        // Step 2: Open raw WebSocket and send session ID as first message
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
        const wsUrl = `${protocol}//${window.location.host}/api/vnc/ws`

        const ws = new WebSocket(wsUrl)
        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => {
            ws.send(JSON.stringify({ sessionId }))
            resolve()
          }
          ws.onerror = () => reject(new Error("WebSocket connection failed"))
        })

        if (cancelled || !screenRef.current) {
          ws.close()
          return
        }

        // Dynamic import to avoid SSR issues
        const { default: RFB } = await import("@novnc/novnc/core/rfb.js")

        if (cancelled || !screenRef.current) {
          ws.close()
          return
        }

        // Pass the already-connected WebSocket to noVNC as a channel
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
  }, [node, vmid, connectAttempt])

  function reconnect() {
    rfbRef.current?.disconnect()
    rfbRef.current = null
    if (screenRef.current) {
      screenRef.current.innerHTML = ""
    }
    setStatus("connecting")
    setError(undefined)
    setConnectAttempt((n) => n + 1)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <IconServer className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">VM {vmid}</span>
        <span className="text-xs text-muted-foreground">(Node: {node})</span>
        <div className="ml-auto flex items-center gap-2">
          {status === "connected" && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <IconPlugConnected className="size-3" />
              Connected
            </span>
          )}
          {(status === "disconnected" || status === "error") && (
            <>
              <span className="flex items-center gap-1 text-xs text-red-500">
                <IconPlugConnectedX className="size-3" />
                {error || "Disconnected"}
              </span>
              <button
                onClick={reconnect}
                className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent"
              >
                Reconnect
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative flex-1">
        {status === "connecting" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={screenRef} className="h-full w-full" />
      </div>
    </div>
  )
}
