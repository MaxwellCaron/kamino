"use client"

import { useEffect, useState } from "react"
import { IconLoader2, IconServer } from "@tabler/icons-react"
import { PROXMOX_CONFIG } from "@workspace/ui/lib/proxmox-config"

/**
 * Builds the noVNC console URL.
 *
 * For local testing (app on a different domain than Proxmox), we pass the
 * ticket via a query-string parameter so the iframe can authenticate without
 * needing a cross-domain cookie.
 *
 * In production, where the app and Proxmox share a parent domain, you would
 * set the PVEAuthCookie on that shared domain instead and remove the
 * `PVEAuthCookie` query param here.
 */
function buildConsoleUrl() {
  const params = new URLSearchParams({
    console: "kvm",
    vmid: String(PROXMOX_CONFIG.vmid),
    node: PROXMOX_CONFIG.nodeName,
    resize: "scale",
    novnc: "1",
  })

  return `${PROXMOX_CONFIG.nodeUrl}/?${params.toString()}`
}

export function VncConsole() {
  const [loading, setLoading] = useState(true)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    // Set the cookie on the Proxmox domain before rendering the iframe.
    // This only works when the app shares the same parent domain as Proxmox.
    // For cross-origin testing, the cookie won't stick — the iframe will
    // fall back to whatever auth Proxmox accepts (e.g. an existing session).
    document.cookie = [
      `PVEAuthCookie=${encodeURIComponent(PROXMOX_CONFIG.ticket)}`,
      `domain=${PROXMOX_CONFIG.cookieDomain}`,
      `path=/`,
      window.location.protocol === "https:" ? "secure" : "",
      "samesite=none",
      "max-age=86400",
    ]
      .filter(Boolean)
      .join("; ")

    setUrl(buildConsoleUrl())
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <IconServer className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">VM {PROXMOX_CONFIG.vmid}</span>
        <span className="text-xs text-muted-foreground">
          (Node: {PROXMOX_CONFIG.nodeName})
        </span>
      </div>
      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {url && (
          <iframe
            className="h-full w-full border-0"
            src={url}
            onLoad={() => setLoading(false)}
            allow="clipboard-read; clipboard-write"
            title={`VNC Console - VM ${PROXMOX_CONFIG.vmid}`}
          />
        )}
      </div>
    </div>
  )
}
