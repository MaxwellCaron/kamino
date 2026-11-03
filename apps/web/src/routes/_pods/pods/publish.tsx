import { createFileRoute, redirect } from "@tanstack/react-router"
import { PublishPodPage } from "@/features/pods/components/publish/publish-pod-page"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"
import { pageTitle } from "@/features/shared/utils/page-title"
import { preloadPublishPodPage } from "@/features/pods/api/pod-route-loaders"
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
