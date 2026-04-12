import { AnimatePresence, motion } from "motion/react"
import { useRef } from "react"
import type { ReactNode } from "react"

const transition = { duration: 0.33, ease: "easeInOut" } as const

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
      <motion.div
        key={isLoading ? "loading" : "loaded"}
        initial={hasBeenLoading.current ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition}
        className={className}
      >
        {isLoading ? fallback : children}
      </motion.div>
    </AnimatePresence>
  )
}

export { transition as loadingTransition }
