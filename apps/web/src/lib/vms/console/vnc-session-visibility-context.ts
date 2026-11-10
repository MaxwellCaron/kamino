import type { Dispatch, SetStateAction } from "react"
import { createContext } from "react"

type VncSessionVisibilityContextValue = {
  pinnedItemId: string | null
  setPinnedItemId: Dispatch<SetStateAction<string | null>>
}

export const VncSessionVisibilityContext =
  createContext<VncSessionVisibilityContextValue | null>(null)
