import { Outlet, createFileRoute } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { SiteHeader } from "@/components/app-shell/site-header"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { InventoryTree } from "@/components/inventory/inventory-tree"
import { CommandManyItems } from "@/components/app-shell/site-command"

export const Route = createFileRoute("/_dashboard")({
  component: Layout,
})

function Layout() {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" inventoryTree={<InventoryTree />} />
      <SidebarInset>
        <SiteHeader command={<CommandManyItems />} />
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
