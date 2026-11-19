import { Outlet, getRouteApi } from "@tanstack/react-router"
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"
import { AppSidebarIconRailContent } from "@/components/app-shell/app-sidebar"
import type { CSSProperties } from "react"
import { InventoryDialogsProvider } from "@/components/inventory/inventory-dialogs-provider"
import { Separator } from "@workspace/ui/components/separator"
import { SiteCommandTrigger } from "@/components/app-shell/site-command"
import { SiteHeader } from "@/components/app-shell/site-header"
import { SiteLayoutInset } from "@/components/app-shell/site-layout-inset"
import { useApplicationEvents } from "@/hooks/app-shell/use-application-events"

const podsRouteApi = getRouteApi("/_pods")

const keepSidebarCollapsed = () => {}

const podIconRailMobileWidth = "calc(var(--spacing) * 16 + 2px)"
const siteCommandTrigger = <SiteCommandTrigger />

export function PodsLayout() {
  useApplicationEvents()
  const { user } = podsRouteApi.useRouteContext()

  return (
    <SidebarProvider
      open={false}
      onOpenChange={keepSidebarCollapsed}
      persistDesktopState={false}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 96)",
          "--sidebar-width-icon": "calc(var(--spacing) * 12)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <InventoryDialogsProvider>
        <Sidebar
          collapsible="icon"
          className="overflow-hidden"
          variant="inset"
          mobileWidth={podIconRailMobileWidth}
        >
          <AppSidebarIconRailContent user={user} />
        </Sidebar>
        <SiteLayoutInset
          header={
            <SiteHeader
              command={siteCommandTrigger}
              sidebarControl={
                <>
                  <SidebarTrigger className="-ml-1 md:hidden" />
                  <Separator
                    orientation="vertical"
                    className="mx-2 h-4 md:hidden data-vertical:self-auto"
                  />
                </>
              }
            />
          }
        >
          <Outlet />
        </SiteLayoutInset>
      </InventoryDialogsProvider>
    </SidebarProvider>
  )
}
