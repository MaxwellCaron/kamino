import { createFileRoute } from "@tanstack/react-router"
import { AppSidebar } from "@workspace/ui/components/app-sidebar"
import { SiteHeader } from "@workspace/ui/components/site-header"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { VncConsole } from "@workspace/ui/components/vnc-console"

export const Route = createFileRoute("/")({ component: App })

function App() {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <VncConsole />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
