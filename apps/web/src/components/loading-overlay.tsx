import { useEffect, useState } from "react"
import { Spinner } from "@workspace/ui/components/spinner"
import { AnimatePresence, m } from "motion/react"
import { loadingTransition } from "@/components/loading-transition"

const SHOW_DELAY_MS = 150

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
    <AnimatePresence>
      {visible && (
        <m.div
          key="preload-overlay"
          aria-busy="true"
          aria-label={label}
          className="absolute inset-0 z-30 flex items-center justify-center bg-background"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={loadingTransition}
        >
          <Spinner className="size-10 opacity-20" />
        </m.div>
      )}
    </AnimatePresence>
  )
}
