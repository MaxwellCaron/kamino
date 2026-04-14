import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { SiteHeader } from "@/components/app-shell/site-header"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { InventoryDialogsProvider } from "@/components/inventory/inventory-dialogs-provider"
import { InventoryTree } from "@/components/inventory/inventory-tree"
import { CommandManyItems } from "@/components/app-shell/site-command"
import { InventoryEvents } from "@/components/inventory/inventory-events"
import { VmStatusEvents } from "@/components/vm/vm-status-events"
import { ensureAuth } from "@/lib/queries"

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: async ({ location }) => {
    try {
      const session = await ensureAuth()
      return { user: session.user }
    } catch {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      })
    }
  },
  component: Layout,
})

function Layout() {
  const { user } = Route.useRouteContext()

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
      <InventoryDialogsProvider>
        <AppSidebar
          user={user}
          variant="inset"
          inventoryTree={<InventoryTree />}
        />
        <SidebarInset>
          <SiteHeader command={<CommandManyItems />} />
          <div className="flex flex-1 flex-col">
            <Outlet />
          </div>
        </SidebarInset>
      </InventoryDialogsProvider>
    </SidebarProvider>
  )
}
