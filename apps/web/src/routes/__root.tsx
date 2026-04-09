import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@workspace/ui/components/sonner"
import { ThemeProvider } from "@workspace/ui/components/theme-provider"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"

import appCss from "@workspace/ui/globals.css?url"
import { InventoryEvents } from "@/components/inventory/inventory-events"
import { VmStatusEvents } from "@/components/vm/vm-status-events"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Kamino",
      },
    ],
    links: [
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/kamino.svg",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => <p>Page not found</p>,
})

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <InventoryEvents />
      <VmStatusEvents />
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <TooltipProvider>
          <Outlet />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
