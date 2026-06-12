import { createRootRouteWithContext } from "@tanstack/react-router"
import appCss from "@workspace/ui/globals.css?url"
import type { QueryClient } from "@tanstack/react-query"
import { NotFound } from "@/components/not-found"
import { formatPageTitle } from "@/features/shared/utils/page-title"
import { RootComponent, RootShell } from "@/components/app-shell/root-layout"

type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
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
        title: formatPageTitle(),
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
  notFoundComponent: NotFound,
})
