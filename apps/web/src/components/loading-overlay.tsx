import { useEffect, useState } from "react"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { AnimatePresence, m } from "motion/react"
import { loadingTransition } from "@/components/loading-transition"

const SHOW_DELAY_MS = 150

function LoadingIndicator({
  label,
  routePendingLabel = false,
}: {
  label: string
  routePendingLabel?: boolean
}) {
  return (
    <>
      <Spinner className="size-5" />
      <span {...(routePendingLabel ? { "data-route-pending-label": "" } : {})}>
        {label}
      </span>
    </>
  )
}

export function RoutePending() {
  return (
    <main
      data-route-pending=""
      role="status"
      aria-busy="true"
      aria-label="Loading Kamino"
      className="flex min-h-svh items-center justify-center gap-3 bg-background text-sm text-muted-foreground"
    >
      <LoadingIndicator label="Loading Kamino..." routePendingLabel />
    </main>
  )
}

export function LazyContentFallback({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex min-h-24 w-full items-center justify-center gap-3 text-sm text-muted-foreground",
        className
      )}
    >
      <LoadingIndicator label={label} />
    </div>
  )
}

export function PreloadOverlay({
  active,
  label = "Loading page",
}: {
  active: boolean
  label?: string
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }

    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [active])

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <m.div
          key="preload-overlay"
          role="status"
          aria-busy="true"
          aria-label={label}
          className="absolute inset-0 z-30 flex items-center justify-center gap-3 bg-background text-sm text-muted-foreground"
          exit={{ opacity: 0 }}
          transition={loadingTransition}
        >
          <LoadingIndicator label={label} />
        </m.div>
      )}
    </AnimatePresence>
  )
}
