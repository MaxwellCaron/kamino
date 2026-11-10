import { createFileRoute, redirect } from "@tanstack/react-router"
import { CreatePodPage } from "@/components/pods/create/create-pod-page"
import { canAccessRequestQueue } from "@/lib/auth/management-permissions"
import { pageTitle } from "@/lib/app-shell/page-title"
import { preloadCreatePodPage } from "@/lib/pods/pod-route-loaders"

export const Route = createFileRoute("/_pods/pods/create")({
  staticData: {
    breadcrumb: { label: "Create" },
  },
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/pods" })
    }
  },
  loader: ({ context }) => preloadCreatePodPage(context.queryClient),
  head: () => pageTitle("Create Pod"),
  component: CreatePodPage,
})
