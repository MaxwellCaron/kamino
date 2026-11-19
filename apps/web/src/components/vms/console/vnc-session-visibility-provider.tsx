import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { VncSessionVisibilityContext } from "@/lib/vms/console/vnc-session-visibility-context"

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
