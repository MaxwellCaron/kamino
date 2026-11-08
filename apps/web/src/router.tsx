import "@/configure-zod"
import type { AppBreadcrumb } from "@/lib/app-shell/site-breadcrumb-data"
import { QueryClient } from "@tanstack/react-query"
import { RoutePending } from "@/components/feedback/loading-overlay"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { shouldRetryApiQuery } from "@/lib/api/api-error"

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetryApiQuery,
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
    defaultPendingComponent: RoutePending,
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
