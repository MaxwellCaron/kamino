import { SiteCommandContext } from "@/lib/app-shell/site-command-context"
import { use } from "react"

export function useSiteCommand() {
  const context = use(SiteCommandContext)
  if (!context) {
    throw new Error("useSiteCommand must be used within SiteCommandProvider")
  }
  return context
}
