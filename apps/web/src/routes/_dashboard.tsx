import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { SiteHeader } from "@/components/app-shell/site-header"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { InventoryTree } from "@/components/inventory/inventory-tree"
import { CommandManyItems } from "@/components/app-shell/site-command"
import { InventoryEvents } from "@/components/inventory/inventory-events"
import { VmStatusEvents } from "@/components/vm/vm-status-events"
import { getAccessToken, refreshAuth } from "@/lib/queries"

async function checkAuth(): Promise<void> {
  // If we already have an access token in memory, we're good
  if (getAccessToken()) return

  // No token in memory (page refresh) — try to get one via refresh cookie
  try {
    await refreshAuth()
  } catch {
    throw redirect({ to: "/login" })
  }
}

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: async () => {
    await checkAuth()
  },
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
      <InventoryEvents />
      <VmStatusEvents />
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
