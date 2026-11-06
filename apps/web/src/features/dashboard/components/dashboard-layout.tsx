import {
  INVENTORY_SIDEBAR_MIN_WIDTH,
  useInventorySidebarResize,
} from "@/features/inventory/hooks/use-inventory-sidebar-resize"
import { Outlet, getRouteApi } from "@tanstack/react-router"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { ApplicationEvents } from "@/components/app-shell/application-events"
import { InventoryDialogsProvider } from "@/components/inventory/inventory-dialogs-provider"
import { InventorySidebarResizeHandle } from "@/features/inventory/components/tree/inventory-sidebar-resize-handle"
import { InventoryTreeProvider } from "@/features/inventory/components/tree/inventory-tree-provider"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { SiteCommandTrigger } from "@/components/app-shell/site-command"
import { SiteHeader } from "@/components/app-shell/site-header"
import { SiteLayoutInset } from "@/components/app-shell/site-layout-inset"
import { SkipToContentLink } from "@/components/app-shell/skip-to-content-link"
import { VncSessionVisibilityProvider } from "@/features/vms/components/dashboard/vnc-session-visibility-context"
import { VncSessionWorkspace } from "@/features/vms/components/dashboard/vnc-session-workspace"

const dashboardRouteApi = getRouteApi("/_dashboard")

const siteCommandTrigger = <SiteCommandTrigger />

export function DashboardLayout() {
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
      <ApplicationEvents />
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
