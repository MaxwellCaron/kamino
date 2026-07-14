import { Outlet, getRouteApi } from "@tanstack/react-router"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"
import { SiteHeader } from "@/components/app-shell/site-header"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { SiteLayoutInset } from "@/components/app-shell/site-layout-inset"
import { InventoryDialogsProvider } from "@/features/inventory/components/inventory-dialogs-provider"
import { InventoryTreeProvider } from "@/features/inventory/components/tree/inventory-tree-provider"
import { InventorySidebarResizeHandle } from "@/features/inventory/components/tree/inventory-sidebar-resize-handle"
import {
  INVENTORY_SIDEBAR_MIN_WIDTH,
  useInventorySidebarResize,
} from "@/features/inventory/hooks/use-inventory-sidebar-resize"
import { CommandManyItems } from "@/components/app-shell/site-command"
import { DashboardEvents } from "@/features/dashboard/components/dashboard-events"
import { VncSessionWorkspace } from "@/features/vms/components/dashboard/vnc-session-workspace"

const dashboardRouteApi = getRouteApi("/_dashboard")

const commandManyItemsElement = <CommandManyItems />

export function DashboardLayout() {
  const { user } = dashboardRouteApi.useRouteContext()
  const {
    width,
    effectiveMax,
    isResizing,
    updateWidthLive,
    commitWidth,
    onResizeStart,
    onResizeEnd,
  } = useInventorySidebarResize()

  return (
    <SidebarProvider
      className={cn(isResizing && "**:duration-0")}
      style={
        {
          "--sidebar-width": `${width}px`,
          "--sidebar-width-icon": "calc(var(--spacing) * 12)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <DashboardEvents />
      <InventoryDialogsProvider>
        <InventoryTreeProvider>
          <AppSidebar user={user} variant="inset" />
          <InventorySidebarResizeHandle
            width={width}
            minWidth={INVENTORY_SIDEBAR_MIN_WIDTH}
            maxWidth={effectiveMax}
            onLiveUpdate={updateWidthLive}
            onCommit={commitWidth}
            onResizeStart={onResizeStart}
            onResizeEnd={onResizeEnd}
          />
          <SiteLayoutInset
            header={<SiteHeader command={commandManyItemsElement} />}
          >
            <Outlet />
            <VncSessionWorkspace />
          </SiteLayoutInset>
        </InventoryTreeProvider>
      </InventoryDialogsProvider>
    </SidebarProvider>
  )
}
