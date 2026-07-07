import { useCallback, useEffect, useMemo, useState } from "react"

export const INVENTORY_SIDEBAR_MIN_WIDTH = 384
export const INVENTORY_SIDEBAR_ABSOLUTE_MAX_WIDTH = 576
export const INVENTORY_SIDEBAR_MAIN_CONTENT_MIN_WIDTH = 384
export const INVENTORY_SIDEBAR_KEYBOARD_STEP = 16
export const INVENTORY_SIDEBAR_WIDTH_STORAGE_KEY = "kamino-inventory-sidebar-width"

function getEffectiveViewportMax(viewportWidth: number): number {
  return Math.max(
    INVENTORY_SIDEBAR_MIN_WIDTH,
    Math.min(
      INVENTORY_SIDEBAR_ABSOLUTE_MAX_WIDTH,
      viewportWidth - INVENTORY_SIDEBAR_MAIN_CONTENT_MIN_WIDTH
    )
  )
}

function normalizeStoredPreference(width: number): number {
  if (!Number.isFinite(width)) {
    return INVENTORY_SIDEBAR_MIN_WIDTH
  }

  const rounded = Math.round(width)
  return Math.max(
    INVENTORY_SIDEBAR_MIN_WIDTH,
    Math.min(INVENTORY_SIDEBAR_ABSOLUTE_MAX_WIDTH, rounded)
  )
}

function clampRenderedWidth(width: number, effectiveMax: number): number {
  return Math.max(
    INVENTORY_SIDEBAR_MIN_WIDTH,
    Math.min(effectiveMax, Math.round(width))
  )
}

function readStoredPreference(): number {
  if (typeof window === "undefined") {
    return INVENTORY_SIDEBAR_MIN_WIDTH
  }

  const raw = localStorage.getItem(INVENTORY_SIDEBAR_WIDTH_STORAGE_KEY)
  if (raw === null) {
    return INVENTORY_SIDEBAR_MIN_WIDTH
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return INVENTORY_SIDEBAR_MIN_WIDTH
  }

  return normalizeStoredPreference(parsed)
}

function writeStoredPreference(width: number) {
  if (typeof window === "undefined") return
  localStorage.setItem(INVENTORY_SIDEBAR_WIDTH_STORAGE_KEY, String(width))
}

export function useInventorySidebarResize() {
  const [preferredWidth, setPreferredWidth] = useState(readStoredPreference)
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1024
  )

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const effectiveMax = useMemo(
    () => getEffectiveViewportMax(viewportWidth),
    [viewportWidth]
  )

  const width = useMemo(() => {
    const source = liveWidth ?? preferredWidth
    return clampRenderedWidth(source, effectiveMax)
  }, [liveWidth, preferredWidth, effectiveMax])

  const updateWidthLive = useCallback(
    (nextWidth: number) => {
      setLiveWidth(clampRenderedWidth(nextWidth, effectiveMax))
    },
    [effectiveMax]
  )

  const commitWidth = useCallback((nextWidth: number) => {
    const normalized = normalizeStoredPreference(nextWidth)
    setPreferredWidth(normalized)
    writeStoredPreference(normalized)
    setLiveWidth(null)
  }, [])

  const onResizeStart = useCallback(() => {
    setIsResizing(true)
  }, [])

  const onResizeEnd = useCallback(() => {
    setIsResizing(false)
  }, [])

  return {
    width,
    effectiveMax,
    isResizing,
    updateWidthLive,
    commitWidth,
    onResizeStart,
    onResizeEnd,
  }
}
