import { m, useSpring } from "motion/react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@workspace/ui/lib/utils"
import type { RefObject } from "react"

// Spring config for smooth tooltip movement
const springConfig = { stiffness: 100, damping: 20 }

export interface TooltipBoxProps {
  /** X position in pixels (relative to container) */
  x: number
  /** Y position in pixels (relative to container) */
  y: number
  /** Whether the tooltip is visible */
  visible: boolean
  /** Container ref for portal rendering */
  containerRef: RefObject<HTMLDivElement | null>
  /** Container width for flip detection */
  containerWidth: number
  /** Container height for bounds clamping */
  containerHeight: number
  /** Offset from the target position */
  offset?: number
  /** Custom class name */
  className?: string
  /** Tooltip content */
  children: React.ReactNode
  /** Override left position (bypasses internal calculation) */
  left?: number | ReturnType<typeof useSpring>
  /** Override top position (bypasses internal calculation) */
  top?: number | ReturnType<typeof useSpring>
  /** Force flip direction (for custom positioning) */
  flipped?: boolean
  /** Whether to animate tooltip entry/movement. Default: true */
  animate?: boolean
  /** Inline styles for the visual tooltip panel */
  panelStyle?: React.CSSProperties
}

export function TooltipBox({
  x,
  y,
  visible,
  containerRef,
  containerWidth,
  containerHeight,
  offset = 16,
  className = "",
  children,
  left: leftOverride,
  top: topOverride,
  flipped: flippedOverride,
  animate = true,
  panelStyle,
}: TooltipBoxProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const tooltipWidthRef = useRef(180)
  const tooltipHeightRef = useRef(80)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const animatedLeft = useSpring(x + offset, springConfig)
  const animatedTop = useSpring(y, springConfig)

  const tw = tooltipWidthRef.current
  const th = tooltipHeightRef.current
  const shouldFlipX = x + tw + offset > containerWidth
  const targetX = shouldFlipX ? x - offset - tw : x + offset
  const targetY = Math.max(
    offset,
    Math.min(y - th / 2, containerHeight - th - offset)
  )

  if (leftOverride === undefined) {
    animatedLeft.set(targetX)
  }
  if (topOverride === undefined) {
    animatedTop.set(targetY)
  }

  useLayoutEffect(() => {
    if (!(visible && tooltipRef.current)) {
      return
    }
    const el = tooltipRef.current
    const w = el.offsetWidth
    const h = el.offsetHeight
    if (w > 0) {
      tooltipWidthRef.current = w
    }
    if (h > 0) {
      tooltipHeightRef.current = h
    }
    const w2 = tooltipWidthRef.current
    const h2 = tooltipHeightRef.current
    const flip = x + w2 + offset > containerWidth
    const tx = flip ? x - offset - w2 : x + offset
    const ty = Math.max(
      offset,
      Math.min(y - h2 / 2, containerHeight - h2 - offset)
    )
    if (leftOverride === undefined) {
      animatedLeft.set(tx)
    }
    if (topOverride === undefined) {
      animatedTop.set(ty)
    }
  }, [
    visible,
    x,
    y,
    containerWidth,
    containerHeight,
    offset,
    leftOverride,
    topOverride,
    animatedLeft,
    animatedTop,
  ])

  const prevFlipRef = useRef(shouldFlipX)
  const [flipKey, setFlipKey] = useState(0)

  useEffect(() => {
    if (prevFlipRef.current !== shouldFlipX) {
      setFlipKey((k) => k + 1)
      prevFlipRef.current = shouldFlipX
    }
  }, [shouldFlipX])

  const finalLeft = leftOverride ?? animatedLeft
  const finalTop = topOverride ?? animatedTop
  const isFlipped = flippedOverride ?? shouldFlipX
  const transformOrigin = isFlipped ? "right top" : "left top"

  const outerInitial = animate ? { opacity: 0 } : false
  const outerAnimate = animate ? { opacity: 1 } : { opacity: 1 }
  const outerExit = animate ? { opacity: 0 } : undefined
  const outerTransition = animate ? { duration: 0.1 } : { duration: 0 }
  const panelInitial = animate
    ? { scale: 0.85, opacity: 0, x: isFlipped ? 20 : -20 }
    : false
  const panelTransition = animate
    ? { type: "spring" as const, stiffness: 300, damping: 25 }
    : { duration: 0 }

  const container = containerRef.current
  if (!(mounted && container)) {
    return null
  }

  if (!visible) {
    return null
  }

  return createPortal(
    <m.div
      animate={outerAnimate}
      className={cn("pointer-events-none absolute z-50", className)}
      exit={outerExit}
      initial={outerInitial}
      ref={tooltipRef}
      style={{ left: finalLeft, top: finalTop }}
      transition={outerTransition}
    >
      <m.div
        animate={{ scale: 1, opacity: 1, x: 0 }}
        className="min-w-35 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-lg backdrop-blur-md"
        initial={panelInitial}
        key={flipKey}
        style={{ ...panelStyle, transformOrigin }}
        transition={panelTransition}
      >
        {children}
      </m.div>
    </m.div>,
    container
  )
}

TooltipBox.displayName = "TooltipBox"

export default TooltipBox
