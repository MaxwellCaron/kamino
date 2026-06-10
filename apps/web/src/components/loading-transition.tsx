import { AnimatePresence, m } from "motion/react"
import { useRef } from "react"
import type { ReactNode } from "react"

type LoadingTransitionProps = {
  isLoading: boolean
  fallback: ReactNode
  children: ReactNode
  className?: string
}

export function LoadingTransition({
  isLoading,
  fallback,
  children,
  className,
}: LoadingTransitionProps) {
  const hasBeenLoading = useRef(isLoading)
  if (isLoading) hasBeenLoading.current = true

  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <m.div
          key="loading"
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={className}
        >
          {fallback}
        </m.div>
      ) : (
        <m.div
          key="loaded"
          initial={hasBeenLoading.current ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={className}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  )
}

export const loadingTransition = { duration: 0.25, ease: "easeOut" } as const
