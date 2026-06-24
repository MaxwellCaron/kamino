import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"
import { SiteBreadcrumb } from "./site-breadcrumb"
import type { ReactNode } from "react"

type SidebarTriggerVisibility = "always" | "mobile" | "never"

export function SiteHeader({
  command,
  sidebarTrigger = "always",
}: {
  command?: ReactNode
  sidebarTrigger?: SidebarTriggerVisibility
}) {
  const showSidebarTrigger = sidebarTrigger !== "never"

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-4 px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center">
          {showSidebarTrigger ? (
            <>
              <SidebarTrigger
                className={cn(
                  "-ml-1",
                  sidebarTrigger === "mobile" && "md:hidden"
                )}
              />
              <Separator
                orientation="vertical"
                className={cn(
                  "mx-2 h-4 data-vertical:self-auto",
                  sidebarTrigger === "mobile" && "md:hidden"
                )}
              />
            </>
          ) : null}
          <SiteBreadcrumb />
        </div>
        {command ? <div className="flex items-center">{command}</div> : null}
      </div>
    </header>
  )
}
