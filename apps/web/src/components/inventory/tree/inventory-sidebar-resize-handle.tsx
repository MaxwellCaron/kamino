import { useEffect, useRef } from "react"
import { INVENTORY_SIDEBAR_KEYBOARD_STEP } from "@/hooks/inventory/tree/use-inventory-sidebar-resize"
import { cn } from "@workspace/ui/lib/utils"
import { useSidebar } from "@workspace/ui/components/sidebar"

type InventorySidebarResizeHandleProps = {
  width: number
  minWidth: number
  maxWidth: number
  onLiveUpdate: (width: number) => void
  onCommit: (width: number) => void
}

export function InventorySidebarResizeHandle({
  width,
  minWidth,
  maxWidth,
  onLiveUpdate,
  onCommit,
}: InventorySidebarResizeHandleProps) {
  const { isMobile, state } = useSidebar()
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const lastWidthRef = useRef(width)

  useEffect(() => {
    lastWidthRef.current = width
  }, [width])

  if (isMobile) {
    return null
  }

  const finishDrag = () => {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false
    onCommit(lastWidthRef.current)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    event.preventDefault()
    isDraggingRef.current = true
    startXRef.current = event.clientX
    startWidthRef.current = width
    lastWidthRef.current = width
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return

    const delta = event.clientX - startXRef.current
    const nextWidth = Math.max(
      minWidth,
      Math.min(maxWidth, Math.round(startWidthRef.current + delta))
    )
    lastWidthRef.current = nextWidth
    event.currentTarget.setAttribute("aria-valuenow", String(nextWidth))
    onLiveUpdate(nextWidth)
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
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
      data-slot="inventory-sidebar-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inventory sidebar"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      aria-hidden={state === "collapsed"}
      tabIndex={state === "collapsed" ? -1 : 0}
      className={cn(
        "invisible fixed inset-y-0 left-(--sidebar-width) z-20 my-7 hidden w-4 -translate-x-1/2 cursor-col-resize touch-none opacity-0 md:flex",
        "peer-data-[state=expanded]:visible peer-data-[state=expanded]:opacity-100",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-sidebar-border",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={finishDrag}
      onKeyDown={handleKeyDown}
    />
  )
}
