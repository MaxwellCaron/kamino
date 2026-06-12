import { QueryClientProvider } from "@tanstack/react-query"
import { LazyMotion, MotionConfig, domMax } from "motion/react"
import { Toaster } from "@workspace/ui/components/sonner"
import { ThemeProvider } from "@workspace/ui/components/theme-provider"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import {
  HeadContent,
  Outlet,
  Scripts,
  getRouteApi,
} from "@tanstack/react-router"

export const themeStorageKey = "vite-ui-theme"
export const defaultTheme = "dark"
export const themeScript = `
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

const rootRouteApi = getRouteApi("__root__")

export function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script>{themeScript}</script>
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

export function RootComponent() {
  const { queryClient } = rootRouteApi.useRouteContext()

  return (
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domMax} strict>
        <MotionConfig reducedMotion="user">
          <ThemeProvider
            defaultTheme={defaultTheme}
            storageKey={themeStorageKey}
          >
            <TooltipProvider>
              <Outlet />
            </TooltipProvider>
          </ThemeProvider>
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  )
}
