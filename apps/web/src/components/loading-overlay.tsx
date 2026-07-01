import { Spinner } from "@workspace/ui/components/spinner"
import { AnimatePresence, m } from "motion/react"
import { loadingTransition } from "@/components/loading-transition"

export function PreloadOverlay({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <m.div
          key="pod-preload-overlay"
          aria-busy="true"
          aria-label="Loading pod"
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
