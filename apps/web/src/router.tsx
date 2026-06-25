import { QueryClient } from "@tanstack/react-query"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import type { AppBreadcrumb } from "@/components/app-shell/site-breadcrumb-data"

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
      },
    },
  })
}

export function getRouter() {
  const queryClient = createQueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: {
      queryClient,
    },

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }

  interface StaticDataRouteOption {
    breadcrumb?: AppBreadcrumb
  }
}
