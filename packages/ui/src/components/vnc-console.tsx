"use client"

import { useState } from "react"
import { IconLoader2, IconServer } from "@tabler/icons-react"

type VncConsoleProps = {
  url: string
  vmid: number
  nodeName: string
}

export function VncConsole({ url, vmid, nodeName }: VncConsoleProps) {
  const [loading, setLoading] = useState(true)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <IconServer className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">VM {vmid}</span>
        <span className="text-xs text-muted-foreground">
          (Node: {nodeName})
        </span>
      </div>
      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <iframe
          className="h-full w-full border-0"
          src={url}
          onLoad={() => setLoading(false)}
          allow="clipboard-read; clipboard-write"
          title={`VNC Console - VM ${vmid}`}
        />
      </div>
    </div>
  )
}
