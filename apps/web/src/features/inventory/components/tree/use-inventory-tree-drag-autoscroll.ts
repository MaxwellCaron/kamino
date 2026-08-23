import { useEffect, useRef } from "react"
import type { TreeInstance } from "@headless-tree/core"
import type { ApiTreeNode } from "../../types/inventory-types"

/** Maximum width/height of an edge zone, in pixels. */
const EDGE_ZONE_MAX_PX = 64
/** Edge zones shrink to this fraction of a short viewport so they never overlap. */
const SHORT_VIEWPORT_ZONE_FRACTION = 1 / 3
/** Maximum autoscroll speed under normal motion preferences, in px/s. */
const NORMAL_MAX_SPEED_PX_PER_SEC = 600
/** Maximum autoscroll speed when the user prefers reduced motion, in px/s. */
const REDUCED_MOTION_MAX_SPEED_PX_PER_SEC = 300
/** Assumed elapsed time for the first animation frame of a scroll loop. */
const FIRST_FRAME_ELAPSED_MS = 16
/** Upper bound on elapsed time credited to any single frame. */
const MAX_FRAME_ELAPSED_MS = 32

/** Pointer-driven autoscroll velocity (px/s); negative near the top edge, positive near the bottom, 0 elsewhere. */
export function getInventoryTreeDragScrollVelocity(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  maxSpeed: number
): number {
  if (clientX < rect.left || clientX > rect.right) {
    return 0
  }
  if (clientY < rect.top || clientY > rect.bottom) {
    return 0
  }

  const zoneSize = Math.min(
    EDGE_ZONE_MAX_PX,
    rect.height * SHORT_VIEWPORT_ZONE_FRACTION
  )

  if (zoneSize <= 0) {
    return 0
  }

  const distanceFromTop = clientY - rect.top
  const distanceFromBottom = rect.bottom - clientY

  if (distanceFromTop < zoneSize) {
    const ratio = clamp01((zoneSize - distanceFromTop) / zoneSize)
    return -ratio * maxSpeed
  }

  if (distanceFromBottom < zoneSize) {
    const ratio = clamp01((zoneSize - distanceFromBottom) / zoneSize)
    return ratio * maxSpeed
  }

  return 0
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Autoscrolls the tree's scroll container while the pointer holds near an edge during an internal drag; observes only, never calls preventDefault/stopPropagation. */
export function useInventoryTreeDragAutoscroll(
  scrollElement: HTMLElement | null,
  tree: TreeInstance<ApiTreeNode>
): void {
  const scrollElementRef = useRef(scrollElement)
  const treeRef = useRef(tree)

  useEffect(() => {
    scrollElementRef.current = scrollElement
  }, [scrollElement])

  useEffect(() => {
    treeRef.current = tree
  }, [tree])

  useEffect(() => {
    if (!scrollElement) {
      return
    }

    const velocityRef = { current: 0 }
    const frameIdRef = { current: null as number | null }
    const lastTimestampRef = { current: null as number | null }

    const stop = () => {
      velocityRef.current = 0
      lastTimestampRef.current = null
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current)
        frameIdRef.current = null
      }
    }

    const tick = (timestamp: number) => {
      const element = scrollElementRef.current
      if (!element || velocityRef.current === 0) {
        frameIdRef.current = null
        lastTimestampRef.current = null
        return
      }

      const lastTimestamp = lastTimestampRef.current
      const elapsedMs =
        lastTimestamp === null
          ? FIRST_FRAME_ELAPSED_MS
          : Math.min(timestamp - lastTimestamp, MAX_FRAME_ELAPSED_MS)
      lastTimestampRef.current = timestamp

      const elapsedSeconds = elapsedMs / 1000
      const delta = velocityRef.current * elapsedSeconds
      const maxScrollTop = Math.max(
        0,
        element.scrollHeight - element.clientHeight
      )
      const nextScrollTop = clampScrollTop(
        element.scrollTop + delta,
        maxScrollTop
      )

      if (nextScrollTop === element.scrollTop) {
        // Reached a scroll boundary; nothing more to do until the pointer moves.
        frameIdRef.current = null
        lastTimestampRef.current = null
        return
      }

      element.scrollTop = nextScrollTop
      frameIdRef.current = requestAnimationFrame(tick)
    }

    const startIfNeeded = () => {
      if (frameIdRef.current === null) {
        frameIdRef.current = requestAnimationFrame(tick)
      }
    }

    const handleDragOver = (event: DragEvent) => {
      const draggedItems = treeRef.current.getState().dnd?.draggedItems
      if (!draggedItems || draggedItems.length === 0) {
        stop()
        return
      }

      const element = scrollElementRef.current
      if (!element) {
        stop()
        return
      }

      const rect = element.getBoundingClientRect()
      const maxSpeed = prefersReducedMotion()
        ? REDUCED_MOTION_MAX_SPEED_PX_PER_SEC
        : NORMAL_MAX_SPEED_PX_PER_SEC
      const velocity = getInventoryTreeDragScrollVelocity(
        event.clientX,
        event.clientY,
        rect,
        maxSpeed
      )

      velocityRef.current = velocity

      if (velocity === 0) {
        if (frameIdRef.current !== null) {
          cancelAnimationFrame(frameIdRef.current)
          frameIdRef.current = null
        }
        lastTimestampRef.current = null
        return
      }

      startIfNeeded()
    }

    const handleDrop = () => {
      stop()
    }

    const handleDragEnd = () => {
      stop()
    }

    const handleBlur = () => {
      stop()
    }

    window.addEventListener("dragover", handleDragOver, true)
    window.addEventListener("drop", handleDrop, true)
    window.addEventListener("dragend", handleDragEnd, true)
    window.addEventListener("blur", handleBlur)

    return () => {
      window.removeEventListener("dragover", handleDragOver, true)
      window.removeEventListener("drop", handleDrop, true)
      window.removeEventListener("dragend", handleDragEnd, true)
      window.removeEventListener("blur", handleBlur)
      stop()
    }
  }, [scrollElement])
}

function clampScrollTop(value: number, max: number): number {
  if (value < 0) return 0
  if (value > max) return max
  return value
}
