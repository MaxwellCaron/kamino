import { AnimatePresence, motion } from "motion/react"
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
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={isLoading ? "loading" : "loaded"}
        initial={{ opacity: 0 }}
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
