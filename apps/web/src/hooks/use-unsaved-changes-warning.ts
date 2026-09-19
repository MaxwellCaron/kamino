import { useCallback } from "react"
import { useBlocker } from "@tanstack/react-router"

const unsavedChangesMessage =
  "Are you sure you want to leave this page? Your changes will be lost."

export function useUnsavedChangesWarning(enabled: boolean) {
  const shouldBlockNavigation = useCallback(() => {
    if (!enabled) return false

    return !window.confirm(unsavedChangesMessage)
  }, [enabled])

  useBlocker({
    shouldBlockFn: shouldBlockNavigation,
    enableBeforeUnload: enabled,
    disabled: !enabled,
  })
}
