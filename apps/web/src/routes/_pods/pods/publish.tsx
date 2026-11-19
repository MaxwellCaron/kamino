import { createFileRoute, redirect } from "@tanstack/react-router"
import { PublishPodPage } from "@/components/pods/publish/publish-pod-page"
import { canAccessRequestQueue } from "@/lib/auth/management-permissions"
import { pageTitle } from "@/lib/app-shell/page-title"
import { preloadPublishPodPage } from "@/lib/pods/pod-route-loaders"
import { z } from "zod"

export const Route = createFileRoute("/_pods/pods/publish")({
  staticData: {
    breadcrumb: { label: "Publish" },
  },
  validateSearch: z.object({
    podId: z.string().optional(),
  }),
  loaderDeps: ({ search }) => ({ podId: search.podId }),
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/pods" })
    }
  },
  loader: ({ context, deps }) =>
    preloadPublishPodPage(context.queryClient, deps.podId),
  head: () => pageTitle("Publish Pod"),
  component: PublishPodPage,
})
