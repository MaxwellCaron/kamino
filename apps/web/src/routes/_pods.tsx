import { PodsLayout } from "@/components/app-shell/pods-layout"
import { createFileRoute } from "@tanstack/react-router"
import { requireAuthSession } from "@/lib/auth/auth-route-loaders"

export const Route = createFileRoute("/_pods")({
  staticData: {
    breadcrumb: { label: "Pods", link: { to: "/pods" } },
  },
  beforeLoad: requireAuthSession,
  component: PodsLayout,
})
