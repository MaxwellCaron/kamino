import { useEffect, useRef } from "react"
import { useSidebar } from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"
import { INVENTORY_SIDEBAR_KEYBOARD_STEP } from "@/features/inventory/hooks/use-inventory-sidebar-resize"

type InventorySidebarResizeHandleProps = {
  width: number
  minWidth: number
  maxWidth: number
  onLiveUpdate: (width: number) => void
  onCommit: (width: number) => void
  onResizeStart: () => void
  onResizeEnd: () => void
}

export function InventorySidebarResizeHandle({
  width,
  minWidth,
  maxWidth,
  onLiveUpdate,
  onCommit,
  onResizeStart,
  onResizeEnd,
}: InventorySidebarResizeHandleProps) {
  const { isMobile, state } = useSidebar()
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const lastWidthRef = useRef(width)
  const handleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    lastWidthRef.current = width
  }, [width])

  useEffect(() => {
    return () => {
      isDraggingRef.current = false
    }
  }, [])

  if (isMobile) {
    return null
  }

  const finishDrag = () => {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false
    onCommit(lastWidthRef.current)
    onResizeEnd()
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    event.preventDefault()
    isDraggingRef.current = true
    startXRef.current = event.clientX
    startWidthRef.current = width
    lastWidthRef.current = width
    event.currentTarget.setPointerCapture(event.pointerId)
    onResizeStart()
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return

    const delta = event.clientX - startXRef.current
    const nextWidth = Math.max(
      minWidth,
      Math.min(maxWidth, Math.round(startWidthRef.current + delta))
    )
    lastWidthRef.current = nextWidth
    onLiveUpdate(nextWidth)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    finishDrag()
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    finishDrag()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null

    switch (event.key) {
      case "ArrowLeft":
        nextWidth = width - INVENTORY_SIDEBAR_KEYBOARD_STEP
        break
      case "ArrowRight":
        nextWidth = width + INVENTORY_SIDEBAR_KEYBOARD_STEP
        break
      case "Home":
        nextWidth = minWidth
        break
      case "End":
        nextWidth = maxWidth
        break
      default:
        return
    }

    event.preventDefault()
    const clamped = Math.max(minWidth, Math.min(maxWidth, nextWidth))
    onCommit(clamped)
  }

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inventory sidebar"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      aria-hidden={state === "collapsed"}
      tabIndex={state === "collapsed" ? -1 : 0}
      className={cn(
        "invisible fixed inset-y-0 z-20 my-7 hidden w-4 -translate-x-1/2 cursor-col-resize touch-none opacity-0 transition-[opacity,visibility] delay-0 duration-0 md:flex",
        "peer-data-[state=expanded]:visible peer-data-[state=expanded]:opacity-100 peer-data-[state=expanded]:delay-200",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-sidebar-border",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      )}
      style={{ left: "var(--sidebar-width)" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
    />
  )
}
