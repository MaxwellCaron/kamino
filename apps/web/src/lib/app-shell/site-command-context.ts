import type * as React from "react"
import { createContext } from "react"

export type SiteCommandContextValue = {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export const SiteCommandContext = createContext<SiteCommandContextValue | null>(
  null
)
