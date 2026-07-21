import { createContext, use, useMemo, useState } from "react"
import type { Dispatch, ReactNode, SetStateAction } from "react"

type VncSessionVisibilityContextValue = {
  pinnedItemId: string | null
  setPinnedItemId: Dispatch<SetStateAction<string | null>>
}

const VncSessionVisibilityContext =
  createContext<VncSessionVisibilityContextValue | null>(null)

export function VncSessionVisibilityProvider({
  children,
}: {
  children: ReactNode
}) {
  const [pinnedItemId, setPinnedItemId] = useState<string | null>(null)
  const value = useMemo(
    () => ({ pinnedItemId, setPinnedItemId }),
    [pinnedItemId]
  )

  return (
    <VncSessionVisibilityContext.Provider value={value}>
      {children}
    </VncSessionVisibilityContext.Provider>
  )
}

export function useIsVncSessionPinned(itemId: string): boolean {
  const ctx = use(VncSessionVisibilityContext)
  if (!ctx) {
    throw new Error(
      "useIsVncSessionPinned must be used within a VncSessionVisibilityProvider"
    )
  }

  return ctx.pinnedItemId === itemId
}

export function useVncSessionVisibilityPublisher() {
  const ctx = use(VncSessionVisibilityContext)
  if (!ctx) {
    throw new Error(
      "useVncSessionVisibilityPublisher must be used within a VncSessionVisibilityProvider"
    )
  }

  return ctx.setPinnedItemId
}
