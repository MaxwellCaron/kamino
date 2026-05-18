import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import type { CSSProperties } from "react"
import { SiteHeader } from "@/components/app-shell/site-header"
import { AppSidebarIconRail } from "@/components/app-shell/app-sidebar"
import { CommandManyItems } from "@/components/app-shell/site-command"
import { ensureAuth } from "@/features/auth/api/auth-api"

const keepSidebarCollapsed = () => {}

export const Route = createFileRoute("/_pods")({
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
  component: PodsLayout,
})

function PodsLayout() {
  const { user } = Route.useRouteContext()

  return (
    <SidebarProvider
      open={false}
      onOpenChange={keepSidebarCollapsed}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 96)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <AppSidebarIconRail user={user} variant="inset" />
      <SidebarInset>
        <SiteHeader command={<CommandManyItems />} sidebarTrigger="mobile" />
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
