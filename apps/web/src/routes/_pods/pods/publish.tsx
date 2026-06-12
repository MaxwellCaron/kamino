import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"
import { PublishPodRoutePage } from "@/features/pods/components/publish/publish-pod-route-page"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_pods/pods/publish")({
  validateSearch: z.object({
    podId: z.string().optional(),
  }),
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/pods/browse" })
    }
  },
  head: () => pageTitle("Publish Pod"),
  component: PublishPodRoutePage,
})
