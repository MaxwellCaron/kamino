import {
  INVENTORY_SIDEBAR_MIN_WIDTH,
  useInventorySidebarResize,
} from "@/hooks/inventory/tree/use-inventory-sidebar-resize"
import { Outlet, getRouteApi } from "@tanstack/react-router"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { InventoryDialogsProvider } from "@/components/inventory/inventory-dialogs-provider"
import { InventorySidebarResizeHandle } from "@/components/inventory/tree/inventory-sidebar-resize-handle"
import { InventoryTreeProvider } from "@/components/inventory/tree/inventory-tree-provider"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { SiteCommandTrigger } from "@/components/app-shell/site-command"
import { SiteHeader } from "@/components/app-shell/site-header"
import { SiteLayoutInset } from "@/components/app-shell/site-layout-inset"
import { SkipToContentLink } from "@/components/app-shell/skip-to-content-link"
import { VncSessionVisibilityProvider } from "@/components/vms/console/vnc-session-visibility-provider"
import { VncSessionWorkspace } from "@/components/vms/console/vnc-session-workspace"
import { useApplicationEvents } from "@/hooks/app-shell/use-application-events"

const dashboardRouteApi = getRouteApi("/_dashboard")

const siteCommandTrigger = <SiteCommandTrigger />

export function DashboardLayout() {
  useApplicationEvents()
  const { user } = dashboardRouteApi.useRouteContext()
  const { width, effectiveMax, sidebarRef, updateWidthLive, commitWidth } =
    useInventorySidebarResize()

  return (
    <SidebarProvider
      ref={sidebarRef}
      className="**:data-[slot=sidebar-container]:transition-none **:data-[slot=sidebar-gap]:transition-none"
      style={
        {
          "--sidebar-width": `${width}px`,
          "--sidebar-width-icon": "calc(var(--spacing) * 12)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <InventoryDialogsProvider>
        <InventoryTreeProvider>
          <SkipToContentLink targetId="main-content" />
          <AppSidebar user={user} variant="inset" />
          <InventorySidebarResizeHandle
            width={width}
            minWidth={INVENTORY_SIDEBAR_MIN_WIDTH}
            maxWidth={effectiveMax}
            onLiveUpdate={updateWidthLive}
            onCommit={commitWidth}
          />
          <SiteLayoutInset header={<SiteHeader command={siteCommandTrigger} />}>
            <VncSessionVisibilityProvider>
              <Outlet />
              <VncSessionWorkspace />
            </VncSessionVisibilityProvider>
          </SiteLayoutInset>
        </InventoryTreeProvider>
      </InventoryDialogsProvider>
    </SidebarProvider>
  )
}
