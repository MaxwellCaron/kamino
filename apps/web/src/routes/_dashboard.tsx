import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { SiteHeader } from "@/components/app-shell/site-header"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { InventoryDialogsProvider } from "@/features/inventory/components/inventory-dialogs-provider"
import { InventoryTreeProvider } from "@/features/inventory/components/tree/inventory-tree"
import { CommandManyItems } from "@/components/app-shell/site-command"
import { DashboardEvents } from "@/features/dashboard/components/dashboard-events"
import { authSessionQueryOptions } from "@/features/auth/api/auth-api"

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: async ({ context, location }) => {
    try {
      const session = await context.queryClient.fetchQuery(
        authSessionQueryOptions
      )
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
            <SiteHeader command={<CommandManyItems />} />
            <div className="flex flex-1 flex-col">
              <Outlet />
            </div>
          </SidebarInset>
        </InventoryTreeProvider>
      </InventoryDialogsProvider>
    </SidebarProvider>
  )
}
