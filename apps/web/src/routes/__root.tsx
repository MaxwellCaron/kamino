import { useEffect } from "react"
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import appCss from "@workspace/ui/globals.css?url"
import {
  ThemeProvider,
  useTheme,
} from "@workspace/ui/components/theme-provider"
import { Toaster } from "sonner"
import type { QueryClient } from "@tanstack/react-query"
import { NotFound } from "@/components/not-found"
import { RouteErrorBoundary } from "@/components/route-error"
import {
  RootComponent as RootContent,
  defaultTheme,
  themeStorageKey,
} from "@/components/app-shell/root-layout"

type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  staticData: {
    breadcrumb: { label: "Home", link: { to: "/" } },
  },
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
      {
        name: "description",
        content: "Internal virtual machine, pod, and Proxmox management.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:image",
        content: "/kamino.svg",
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
  errorComponent: RouteErrorBoundary,
})

function RootComponent() {
  return (
    <ThemeProvider defaultTheme={defaultTheme} storageKey={themeStorageKey}>
      <ThemeHotkey />
      <RootContent />
      <Toaster />
    </ThemeProvider>
  )
}

const themeScript = `
(() => {
  const storageKey = ${JSON.stringify(themeStorageKey)}
  const defaultTheme = ${JSON.stringify(defaultTheme)}
  const root = document.documentElement
  const storedTheme = localStorage.getItem(storageKey)
  const theme = storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
    ? storedTheme
    : defaultTheme
  const resolvedTheme = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme

  root.classList.remove("light", "dark")
  root.classList.add(resolvedTheme)
  root.style.colorScheme = resolvedTheme
})()
`

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script>{themeScript}</script>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      if (
        event.key.toLowerCase() !== "d" ||
        !event.shiftKey ||
        !(event.metaKey || event.ctrlKey)
      ) {
        return
      }

      event.preventDefault()
      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [resolvedTheme, setTheme])

  return null
}
