import {
  VNC_IDLE_TIMEOUT_MS,
  formatElapsed,
} from "@/lib/vms/console/vnc-settings"
import { useEffect, useRef, useState } from "react"

export function useElapsed(since: number | null, active: boolean): string {
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

export function useVncIdleExpiry(
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
