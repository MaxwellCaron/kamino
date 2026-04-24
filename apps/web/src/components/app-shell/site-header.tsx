import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { SiteBreadcrumb } from "./site-breadcrumb"
import type { ReactNode } from "react"

export function SiteHeader({ command }: { command?: ReactNode }) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-4 px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 h-4 data-vertical:self-auto"
          />
          <SiteBreadcrumb />
        </div>
        {command ? <div className="flex items-center">{command}</div> : null}
      </div>
    </header>
  )
}
