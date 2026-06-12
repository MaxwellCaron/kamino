import { Outlet, getRouteApi } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { SiteHeader } from "@/components/app-shell/site-header"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { InventoryDialogsProvider } from "@/features/inventory/components/inventory-dialogs-provider"
import { InventoryTreeProvider } from "@/features/inventory/components/tree/inventory-tree-provider"
import { CommandManyItems } from "@/components/app-shell/site-command"
import { DashboardEvents } from "@/features/dashboard/components/dashboard-events"

const dashboardRouteApi = getRouteApi("/_dashboard")

const commandManyItemsElement = <CommandManyItems />

export function DashboardLayout() {
  const { user } = dashboardRouteApi.useRouteContext()

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 96)",
          "--sidebar-width-icon": "calc(var(--spacing) * 12)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <DashboardEvents />
      <InventoryDialogsProvider>
        <InventoryTreeProvider>
          <AppSidebar user={user} variant="inset" />
          <SidebarInset>
            <SiteHeader command={commandManyItemsElement} />
            <div className="flex flex-1 flex-col">
              <Outlet />
            </div>
          </SidebarInset>
        </InventoryTreeProvider>
      </InventoryDialogsProvider>
    </SidebarProvider>
  )
}
