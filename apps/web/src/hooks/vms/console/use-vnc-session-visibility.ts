import { VncSessionVisibilityContext } from "@/lib/vms/console/vnc-session-visibility-context"
import { use } from "react"

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
