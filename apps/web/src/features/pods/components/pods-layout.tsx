import { Outlet, getRouteApi } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import type { CSSProperties } from "react"
import { SiteHeader } from "@/components/app-shell/site-header"
import { AppSidebarIconRail } from "@/components/app-shell/app-sidebar"
import { CommandManyItems } from "@/components/app-shell/site-command"
import { DashboardEvents } from "@/features/dashboard/components/dashboard-events"
import { InventoryDialogsProvider } from "@/features/inventory/components/inventory-dialogs-provider"
import { PodBreadcrumbs } from "@/features/pods/components/pod-breadcrumbs"

const podsRouteApi = getRouteApi("/_pods")

const keepSidebarCollapsed = () => {}

const podBreadcrumbsElement = <PodBreadcrumbs />
const commandManyItemsElement = <CommandManyItems />

export function PodsLayout() {
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
      <DashboardEvents />
      <InventoryDialogsProvider>
        <AppSidebarIconRail user={user} variant="inset" />
        <SidebarInset>
          <SiteHeader
            breadcrumb={podBreadcrumbsElement}
            command={commandManyItemsElement}
            sidebarTrigger="mobile"
          />
          <div className="flex flex-1 flex-col">
            <Outlet />
          </div>
        </SidebarInset>
      </InventoryDialogsProvider>
    </SidebarProvider>
  )
}
