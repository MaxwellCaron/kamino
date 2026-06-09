import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import type { CSSProperties } from "react"
import { SiteHeader } from "@/components/app-shell/site-header"
import { AppSidebarIconRail } from "@/components/app-shell/app-sidebar"
import { CommandManyItems } from "@/components/app-shell/site-command"
import { DashboardEvents } from "@/features/dashboard/components/dashboard-events"
import { authSessionQueryOptions } from "@/features/auth/api/auth-api"
import { InventoryDialogsProvider } from "@/features/inventory/components/inventory-dialogs-provider"
import { PodBreadcrumbs } from "@/features/pods/components/pod-breadcrumbs"

const keepSidebarCollapsed = () => {}

export const Route = createFileRoute("/_pods")({
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
  component: PodsLayout,
})

function PodsLayout() {
  const { user } = Route.useRouteContext()

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
            breadcrumb={<PodBreadcrumbs />}
            command={<CommandManyItems />}
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
