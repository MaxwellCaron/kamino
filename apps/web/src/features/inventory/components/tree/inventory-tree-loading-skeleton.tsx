import { useLayoutEffect, useRef, useState } from "react"
import {
  INVENTORY_TREE_ROW_HEIGHT,
  InventoryTreeRowSkeleton,
} from "./inventory-tree-row-skeleton"

const MIN_LOADING_ROWS = 6

export function InventoryTreeLoadingSkeleton() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rowCount, setRowCount] = useState(MIN_LOADING_ROWS)

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return

    const scrollContainer =
      element.closest<HTMLElement>('[data-slot="tree-scroll-container"]') ??
      element

    const updateRowCount = () => {
      const height = scrollContainer.clientHeight
      setRowCount(
        Math.max(MIN_LOADING_ROWS, Math.ceil(height / INVENTORY_TREE_ROW_HEIGHT))
      )
    }

    updateRowCount()

    const observer = new ResizeObserver(updateRowCount)
    observer.observe(scrollContainer)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="flex min-h-full flex-col pt-1"
      data-testid="inventory-tree-loading-skeleton"
    >
      {Array.from({ length: rowCount }, (_value, index) => (
        <InventoryTreeRowSkeleton
          key={index}
          isFolder={index % 4 === 0}
          level={index % 3}
        />
      ))}
    </div>
  )
}
