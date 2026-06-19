import { SidebarInset } from "@workspace/ui/components/sidebar"
import type { ReactNode } from "react"
import { SiteFooter } from "@/components/app-shell/site-footer"

export function SiteLayoutInset({
  header,
  children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  return (
    <SidebarInset>
      {header}
      <div className="flex min-h-svh flex-col">{children}</div>
      <SiteFooter />
    </SidebarInset>
  )
}
