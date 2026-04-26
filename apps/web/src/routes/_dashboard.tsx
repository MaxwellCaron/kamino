import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { SiteHeader } from "@/components/app-shell/site-header"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { InventoryDialogsProvider } from "@/features/inventory/components/inventory-dialogs-provider"
import { InventoryTreeProvider } from "@/features/inventory/components/tree/inventory-tree"
import { CommandManyItems } from "@/components/app-shell/site-command"
import { InventoryEvents } from "@/features/inventory/components/inventory-events"
import { VmStatusEvents } from "@/features/vms/components/vm-status-events"
import { RequestEvents } from "@/features/requests/components/request-events"
import { ensureAuth } from "@/features/auth/api/auth-queries"

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
          "--sidebar-width": "calc(var(--spacing) * 96)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <InventoryEvents />
      <VmStatusEvents />
      <RequestEvents />
      <InventoryTreeProvider>
        <InventoryDialogsProvider>
          <AppSidebar user={user} variant="inset" />
          <SidebarInset>
            <SiteHeader command={<CommandManyItems />} />
            <div className="flex flex-1 flex-col">
              <Outlet />
            </div>
          </SidebarInset>
        </InventoryDialogsProvider>
      </InventoryTreeProvider>
    </SidebarProvider>
  )
}
