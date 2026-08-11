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
    <SidebarInset id="main-content" tabIndex={-1}>
      {header}
      <div
        className="relative flex min-h-svh flex-col"
        data-vnc-layout-anchor
      >
        {children}
      </div>
      <SiteFooter />
    </SidebarInset>
  )
}
