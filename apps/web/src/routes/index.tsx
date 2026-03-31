import { createFileRoute } from "@tanstack/react-router"
import { AppSidebar } from "@workspace/ui/components/app-sidebar"
import { SiteHeader } from "@workspace/ui/components/site-header"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { Card } from "@workspace/ui/components/card"
import TreeExample from "@workspace/ui/components/tree-example"

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
          <div className="@container/main flex flex-1 flex-col items-center gap-2 p-6">
            <Card className="w-100">
              <TreeExample />
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
