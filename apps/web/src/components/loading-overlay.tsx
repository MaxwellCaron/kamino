import { Spinner } from "@workspace/ui/components/spinner"
import { AnimatePresence, m } from "motion/react"
import { loadingTransition } from "@/components/loading-transition"

export function PreloadOverlay({
  active,
  label = "Loading page",
}: {
  active: boolean
  label?: string
}) {
  return (
    <AnimatePresence>
      {active && (
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
