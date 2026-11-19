import { LazyMotion, MotionConfig, domMax } from "motion/react"
import { Outlet, getRouteApi } from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { SiteCommandProvider } from "./site-command"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

const rootRouteApi = getRouteApi("__root__")

export function RootComponent() {
  const { queryClient } = rootRouteApi.useRouteContext()

  return (
    <QueryClientProvider client={queryClient}>
      <SiteCommandProvider>
        <LazyMotion features={domMax} strict>
          <MotionConfig reducedMotion="user">
            <TooltipProvider>
              <Outlet />
            </TooltipProvider>
          </MotionConfig>
        </LazyMotion>
      </SiteCommandProvider>
    </QueryClientProvider>
  )
}
